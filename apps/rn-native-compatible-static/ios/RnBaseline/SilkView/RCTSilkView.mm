// RCTSilkView — Fabric component view for <SilkView> (iOS, Metal).
//
// - Rendering: a CAMetalLayer-backed subview, one fullscreen triangle drawn
//   with silk_vertex / silk_fragment from silk.metal (compiled by Xcode at
//   build time into default.metallib).
// - Driver: CADisplayLink on the main run loop (no JS per frame).
// - Clock: elapsed seconds accumulated natively in double precision
//   (dt * speed while not paused), or `frozenTime` when >= 0. Phases =
//   fract(t / {41, 59, 23, 53}) in double, cast to float only for the GPU
//   (contract of shaders/silk.glsl).
// - Pixel ratio capped at 2: drawable = bounds * min(screen scale, 2).
// - Events: onFirstFrame {ms} when the GPU has completed the first frame (ms
//   since the view was created), onFrameStats {fps, avgMs, p95Ms} every ~1 s,
//   measured from the display-link callbacks that rendered a frame.

#import "RCTSilkView.h"

#import <Metal/Metal.h>
#import <QuartzCore/QuartzCore.h>

#import <react/renderer/components/SilkViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/SilkViewSpec/EventEmitters.h>
#import <react/renderer/components/SilkViewSpec/Props.h>
#import <react/renderer/components/SilkViewSpec/RCTComponentViewHelpers.h>

#include <algorithm>
#include <cmath>
#include <vector>

using namespace facebook::react;

static const double kPeriods[4] = {41.0, 59.0, 23.0, 53.0};
static const CGFloat kMaxPixelRatio = 2.0;
static const CFTimeInterval kStatsInterval = 1.0;

// Same layout as the `Uniforms` struct of silk.metal (32 bytes).
typedef struct {
  float resolution[2];
  float pad[2];
  float phase[4];
} SilkUniforms;

#pragma mark - Shared Metal objects

static id<MTLDevice> SilkDevice(void) {
  static id<MTLDevice> device;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ device = MTLCreateSystemDefaultDevice(); });
  return device;
}

static id<MTLCommandQueue> SilkQueue(void) {
  static id<MTLCommandQueue> queue;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ queue = [SilkDevice() newCommandQueue]; });
  return queue;
}

static id<MTLRenderPipelineState> SilkPipeline(void) {
  static id<MTLRenderPipelineState> pipeline;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    // "[effect] shader setup N ms": library load + pipeline creation (the
    // Metal source was compiled at BUILD time into default.metallib).
    CFTimeInterval t0 = CACurrentMediaTime();
    NSError *error = nil;
    id<MTLLibrary> library = [SilkDevice() newDefaultLibrary]; // default.metallib (silk.metal)
    MTLRenderPipelineDescriptor *desc = [MTLRenderPipelineDescriptor new];
    desc.vertexFunction = [library newFunctionWithName:@"silk_vertex"];
    desc.fragmentFunction = [library newFunctionWithName:@"silk_fragment"];
    desc.colorAttachments[0].pixelFormat = MTLPixelFormatBGRA8Unorm;
    pipeline = [SilkDevice() newRenderPipelineStateWithDescriptor:desc error:&error];
    if (!pipeline) {
      NSLog(@"[SilkView] pipeline error: %@", error);
    }
    NSLog(@"[effect] shader setup %.1f ms (metallib load + pipeline)", (CACurrentMediaTime() - t0) * 1000.0);
  });
  return pipeline;
}

#pragma mark - Metal layer view

@interface RCTSilkMetalView : UIView
@property (nonatomic, readonly) CAMetalLayer *metalLayer;
@end

@implementation RCTSilkMetalView
+ (Class)layerClass
{
  return [CAMetalLayer class];
}
- (CAMetalLayer *)metalLayer
{
  return (CAMetalLayer *)self.layer;
}
@end

// CADisplayLink retains its target: break the cycle with a weak proxy.
@interface RCTSilkWeakTarget : NSObject
@property (nonatomic, weak) id target;
@end
@implementation RCTSilkWeakTarget
- (void)tick:(CADisplayLink *)link
{
  [self.target performSelector:@selector(tick:) withObject:link];
}
@end

#pragma mark - Component view

@interface RCTSilkView () <RCTSilkViewViewProtocol>
@end

@implementation RCTSilkView {
  RCTSilkMetalView *_metalView;
  CADisplayLink *_link;

  BOOL _paused;
  double _frozenTime; // < 0 = live
  double _speed;

  double _elapsed; // seconds, double precision
  CFTimeInterval _lastTick; // 0 = none yet
  BOOL _needsDraw;

  CFTimeInterval _createdAt;
  BOOL _firstFramePresented;
  BOOL _firstFrameSent;
  double _firstFrameMs;

  std::vector<double> _frameTimes; // callback times (s) since last stats event
  CFTimeInterval _statsStart;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<SilkViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const SilkViewProps>();
    _props = defaultProps;
    _metalView = [[RCTSilkMetalView alloc] initWithFrame:self.bounds];
    CAMetalLayer *layer = _metalView.metalLayer;
    layer.device = SilkDevice();
    layer.pixelFormat = MTLPixelFormatBGRA8Unorm;
    layer.framebufferOnly = YES;
    layer.opaque = YES;
    self.contentView = _metalView;
    [self resetState];
  }
  return self;
}

- (void)resetState
{
  _paused = NO;
  _frozenTime = -1;
  _speed = 1;
  _elapsed = 0;
  _lastTick = 0;
  _needsDraw = YES;
  _createdAt = CACurrentMediaTime();
  _firstFramePresented = NO;
  _firstFrameSent = NO;
  _frameTimes.clear();
  _statsStart = 0;
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
  [self stopLink];
  [self resetState];
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<SilkViewProps const>(props);
  _paused = newProps.paused;
  _frozenTime = newProps.frozenTime;
  _speed = newProps.speed;
  _needsDraw = YES;
  [super updateProps:props oldProps:oldProps];
}

#pragma mark Layout / lifecycle

- (CGFloat)renderScale
{
  CGFloat screenScale = self.window ? self.window.screen.scale : self.traitCollection.displayScale;
  if (screenScale <= 0) {
    screenScale = 1;
  }
  return MIN(screenScale, kMaxPixelRatio);
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  CGFloat scale = [self renderScale];
  _metalView.contentScaleFactor = scale;
  CGSize size = _metalView.bounds.size;
  _metalView.metalLayer.drawableSize = CGSizeMake(std::round(size.width * scale), std::round(size.height * scale));
  _needsDraw = YES;
}

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  if (self.window) {
    [self startLink];
    [self setNeedsLayout];
  } else {
    [self stopLink];
  }
}

- (void)startLink
{
  if (_link) {
    return;
  }
  RCTSilkWeakTarget *proxy = [RCTSilkWeakTarget new];
  proxy.target = self;
  _link = [CADisplayLink displayLinkWithTarget:proxy selector:@selector(tick:)];
  [_link addToRunLoop:[NSRunLoop mainRunLoop] forMode:NSRunLoopCommonModes];
  _lastTick = 0;
}

- (void)stopLink
{
  [_link invalidate];
  _link = nil;
}

- (void)dealloc
{
  [_link invalidate];
}

#pragma mark Frame loop

- (void)tick:(CADisplayLink *)link
{
  CFTimeInterval now = CACurrentMediaTime();
  if (_lastTick > 0 && !_paused) {
    _elapsed += (now - _lastTick) * _speed;
  }
  _lastTick = now;

  [self flushFirstFrameEvent];

  // Live and not paused: draw every frame. Paused / frozen: only redraw on
  // changes (props, size) — the picture does not change otherwise.
  BOOL animating = !_paused && _frozenTime < 0;
  if (!animating) {
    _frameTimes.clear(); // stats only describe continuous animation
    _statsStart = 0;
    if (!_needsDraw) {
      return;
    }
  }
  if ([self draw]) {
    _needsDraw = NO;
    [self recordFrame:now];
  }
}

- (BOOL)draw
{
  CAMetalLayer *layer = _metalView.metalLayer;
  CGSize ds = layer.drawableSize;
  id<MTLRenderPipelineState> pipeline = SilkPipeline();
  if (ds.width < 1 || ds.height < 1 || !pipeline) {
    return NO;
  }
  id<CAMetalDrawable> drawable = [layer nextDrawable];
  if (!drawable) {
    return NO;
  }

  double t = _frozenTime >= 0 ? _frozenTime : _elapsed;
  SilkUniforms u;
  u.resolution[0] = (float)ds.width;
  u.resolution[1] = (float)ds.height;
  u.pad[0] = u.pad[1] = 0;
  for (int i = 0; i < 4; i++) {
    double p = std::fmod(t / kPeriods[i], 1.0);
    if (p < 0) {
      p += 1.0;
    }
    u.phase[i] = (float)p;
  }

  MTLRenderPassDescriptor *pass = [MTLRenderPassDescriptor renderPassDescriptor];
  pass.colorAttachments[0].texture = drawable.texture;
  pass.colorAttachments[0].loadAction = MTLLoadActionDontCare;
  pass.colorAttachments[0].storeAction = MTLStoreActionStore;

  id<MTLCommandBuffer> cmd = [SilkQueue() commandBuffer];
  id<MTLRenderCommandEncoder> enc = [cmd renderCommandEncoderWithDescriptor:pass];
  [enc setRenderPipelineState:pipeline];
  [enc setFragmentBytes:&u length:sizeof(u) atIndex:0];
  [enc drawPrimitives:MTLPrimitiveTypeTriangle vertexStart:0 vertexCount:3];
  [enc endEncoding];

  if (!_firstFramePresented) {
    // Only hook the first frame. The iOS 27 SDK no longer exposes
    // -[MTLDrawable addPresentedHandler:], so "first frame" = the GPU has
    // finished rendering the first drawable (its present follows at vsync).
    _firstFramePresented = YES;
    __weak RCTSilkView *weakSelf = self;
    CFTimeInterval createdAt = _createdAt;
    [cmd addCompletedHandler:^(id<MTLCommandBuffer> b) {
      double ms = (CACurrentMediaTime() - createdAt) * 1000.0;
      dispatch_async(dispatch_get_main_queue(), ^{
        RCTSilkView *strongSelf = weakSelf;
        if (strongSelf) {
          strongSelf->_firstFrameMs = ms;
          [strongSelf flushFirstFrameEvent];
        }
      });
    }];
  }
  [cmd presentDrawable:drawable];
  [cmd commit];
  return YES;
}

- (void)flushFirstFrameEvent
{
  if (_firstFrameSent || _firstFrameMs <= 0) {
    return;
  }
  if (!_eventEmitter) {
    return; // retried on the next tick
  }
  _firstFrameSent = YES;
  std::static_pointer_cast<const SilkViewEventEmitter>(_eventEmitter)
      ->onFirstFrame(SilkViewEventEmitter::OnFirstFrame{.ms = _firstFrameMs});
}

- (void)recordFrame:(CFTimeInterval)now
{
  if (_statsStart == 0) {
    _statsStart = now;
  }
  _frameTimes.push_back(now);
  if (now - _statsStart < kStatsInterval || _frameTimes.size() < 3) {
    return;
  }
  std::vector<double> deltas;
  deltas.reserve(_frameTimes.size());
  for (size_t i = 1; i < _frameTimes.size(); i++) {
    deltas.push_back((_frameTimes[i] - _frameTimes[i - 1]) * 1000.0);
  }
  double span = (_frameTimes.back() - _frameTimes.front()) * 1000.0;
  size_t n = deltas.size();
  std::sort(deltas.begin(), deltas.end());
  size_t idx = std::min(n - 1, (size_t)std::max<long>(0, (long)std::ceil(0.95 * n) - 1));
  double fps = n * 1000.0 / span;
  double avg = span / n;
  double p95 = deltas[idx];
  // next window starts at this frame
  _frameTimes.clear();
  _frameTimes.push_back(now);
  _statsStart = now;
  if (_eventEmitter) {
    std::static_pointer_cast<const SilkViewEventEmitter>(_eventEmitter)
        ->onFrameStats(SilkViewEventEmitter::OnFrameStats{.fps = fps, .avgMs = avg, .p95Ms = p95});
  }
}

@end
