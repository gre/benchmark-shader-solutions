// ShaderBenchCompatStaticView — Fabric component view (iOS, Metal) of
// @shader-bench/native-compatible-static. Same renderer as @shader-bench/native's
// ShaderBenchNativeView (Metal is available on every iOS >= 15.1 device),
// with its own class / symbol names (SBCS*) so both packages can be linked
// in the same app. Uses only Fabric APIs present in RN 0.81+.
//
// - Shader: `<shader>.metallib` from ShaderBenchCompatStatic.bundle (compiled at
//   build time by the podspec script phase), functions `<shader>_vertex` /
//   `<shader>_fragment`; one fullscreen triangle. Pipelines are cached per
//   name. Unknown shader / load error: solid #1b1a33 + NSLog.
// - Uniforms (fragment buffer 0, 96 bytes): resolution, pad, phase,
//   params[4] — the layout of src/registry.ts (UNIFORM_FLOATS = 24).
// - Driver: CADisplayLink on the main run loop (no JS per frame).
// - Clock: elapsed += dt * speed, in double; phases = fract(t / periods[i])
//   in double, cast to float only for the GPU. speed 0 => frozen, redraw
//   only when props or size change.
// - Pixel ratio capped at 2: drawable = bounds * min(screen scale, 2).

#import "ShaderBenchCompatStaticView.h"

#import <Metal/Metal.h>
#import <QuartzCore/QuartzCore.h>

#import <react/renderer/components/ShaderBenchCompatStaticSpec/ComponentDescriptors.h>
#import <react/renderer/components/ShaderBenchCompatStaticSpec/EventEmitters.h>
#import <react/renderer/components/ShaderBenchCompatStaticSpec/Props.h>
#import <react/renderer/components/ShaderBenchCompatStaticSpec/RCTComponentViewHelpers.h>

#include <cmath>

using namespace facebook::react;

static const CGFloat kMaxPixelRatio = 2.0;
static const int kParamFloats = 16; // MAX_PARAMS = PARAM_VEC4S * 4

typedef struct {
  float resolution[2];
  float pad[2];
  float phase[4];
  float params[kParamFloats];
} SBCSUniforms; // 96 bytes

#pragma mark - Shared Metal objects

static id<MTLDevice> SBCSDevice(void)
{
  static id<MTLDevice> device;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ device = MTLCreateSystemDefaultDevice(); });
  return device;
}

static id<MTLCommandQueue> SBCSQueue(void)
{
  static id<MTLCommandQueue> queue;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ queue = [SBCSDevice() newCommandQueue]; });
  return queue;
}

static NSBundle *SBCSBundle(void)
{
  static NSBundle *bundle;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    NSURL *url = [[NSBundle bundleForClass:[ShaderBenchCompatStaticView class]] URLForResource:@"ShaderBenchCompatStatic"
                                                                       withExtension:@"bundle"];
    bundle = url ? [NSBundle bundleWithURL:url] : nil;
    if (!bundle) {
      NSLog(@"[ShaderBenchCompatStatic] ShaderBenchCompatStatic.bundle not found");
    }
  });
  return bundle;
}

/// Pipeline for a shader name, cached; NSNull when it failed to load.
static id<MTLRenderPipelineState> SBCSPipeline(NSString *name)
{
  static NSMutableDictionary<NSString *, id> *cache;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ cache = [NSMutableDictionary new]; });
  id cached = cache[name];
  if (cached) {
    return cached == [NSNull null] ? nil : cached;
  }
  id<MTLRenderPipelineState> pipeline = nil;
  NSError *error = nil;
  NSURL *url = [SBCSBundle() URLForResource:name withExtension:@"metallib"];
  id<MTLLibrary> library = url ? [SBCSDevice() newLibraryWithURL:url error:&error] : nil;
  if (library) {
    MTLRenderPipelineDescriptor *desc = [MTLRenderPipelineDescriptor new];
    desc.vertexFunction = [library newFunctionWithName:[name stringByAppendingString:@"_vertex"]];
    desc.fragmentFunction = [library newFunctionWithName:[name stringByAppendingString:@"_fragment"]];
    desc.colorAttachments[0].pixelFormat = MTLPixelFormatBGRA8Unorm;
    if (desc.vertexFunction && desc.fragmentFunction) {
      pipeline = [SBCSDevice() newRenderPipelineStateWithDescriptor:desc error:&error];
    }
  }
  if (!pipeline) {
    NSLog(@"[ShaderBenchCompatStatic] cannot load shader \"%@\" (%@.metallib): %@", name, name, error);
  }
  cache[name] = pipeline ?: (id)[NSNull null];
  return pipeline;
}

#pragma mark - Metal layer view

@interface SBCSMetalView : UIView
@property (nonatomic, readonly) CAMetalLayer *metalLayer;
@end

@implementation SBCSMetalView
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
@interface SBCSWeakTarget : NSObject
@property (nonatomic, weak) id target;
@end
@implementation SBCSWeakTarget
- (void)tick:(CADisplayLink *)link
{
  [self.target performSelector:@selector(tick:) withObject:link];
}
@end

#pragma mark - Component view

@interface ShaderBenchCompatStaticView () <RCTShaderBenchCompatStaticViewViewProtocol>
@end

@implementation ShaderBenchCompatStaticView {
  SBCSMetalView *_metalView;
  CADisplayLink *_link;

  NSString *_shader;
  double _periods[4];
  float _params[kParamFloats];
  double _speed;

  double _elapsed; // seconds (speed-scaled), double precision
  CFTimeInterval _lastTick; // 0 = none yet
  BOOL _needsDraw;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<ShaderBenchCompatStaticViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const ShaderBenchCompatStaticViewProps>();
    _props = defaultProps;
    _metalView = [[SBCSMetalView alloc] initWithFrame:self.bounds];
    CAMetalLayer *layer = _metalView.metalLayer;
    layer.device = SBCSDevice();
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
  _shader = @"";
  for (int i = 0; i < 4; i++) {
    _periods[i] = 1;
  }
  for (int i = 0; i < kParamFloats; i++) {
    _params[i] = 0;
  }
  _speed = 1;
  _elapsed = 0;
  _lastTick = 0;
  _needsDraw = YES;
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
  [self stopLink];
  [self resetState];
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &p = *std::static_pointer_cast<ShaderBenchCompatStaticViewProps const>(props);
  _shader = [NSString stringWithUTF8String:p.shader.c_str()];
  for (int i = 0; i < 4; i++) {
    _periods[i] = i < (int)p.periods.size() && p.periods[i] > 0 ? p.periods[i] : 1;
  }
  for (int i = 0; i < kParamFloats; i++) {
    _params[i] = i < (int)p.params.size() ? p.params[i] : 0;
  }
  _speed = p.speed;
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
  SBCSWeakTarget *proxy = [SBCSWeakTarget new];
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
  if (_lastTick > 0) {
    _elapsed += (now - _lastTick) * _speed;
  }
  _lastTick = now;
  // Animating: draw every frame. Frozen (speed 0): only on changes.
  if (_speed == 0 && !_needsDraw) {
    return;
  }
  if ([self draw]) {
    _needsDraw = NO;
  }
}

- (BOOL)draw
{
  CAMetalLayer *layer = _metalView.metalLayer;
  CGSize ds = layer.drawableSize;
  if (ds.width < 1 || ds.height < 1 || _shader.length == 0) {
    return NO;
  }
  id<CAMetalDrawable> drawable = [layer nextDrawable];
  if (!drawable) {
    return NO;
  }
  id<MTLRenderPipelineState> pipeline = SBCSPipeline(_shader);

  MTLRenderPassDescriptor *pass = [MTLRenderPassDescriptor renderPassDescriptor];
  pass.colorAttachments[0].texture = drawable.texture;
  pass.colorAttachments[0].storeAction = MTLStoreActionStore;
  if (pipeline) {
    pass.colorAttachments[0].loadAction = MTLLoadActionDontCare;
  } else {
    pass.colorAttachments[0].loadAction = MTLLoadActionClear; // fallback #1b1a33
    pass.colorAttachments[0].clearColor = MTLClearColorMake(0x1b / 255.0, 0x1a / 255.0, 0x33 / 255.0, 1);
  }

  id<MTLCommandBuffer> cmd = [SBCSQueue() commandBuffer];
  id<MTLRenderCommandEncoder> enc = [cmd renderCommandEncoderWithDescriptor:pass];
  if (pipeline) {
    SBCSUniforms u;
    u.resolution[0] = (float)ds.width;
    u.resolution[1] = (float)ds.height;
    u.pad[0] = u.pad[1] = 0;
    for (int i = 0; i < 4; i++) {
      double p = std::fmod(_elapsed / _periods[i], 1.0);
      if (p < 0) {
        p += 1.0;
      }
      u.phase[i] = (float)p;
    }
    for (int i = 0; i < kParamFloats; i++) {
      u.params[i] = _params[i];
    }
    [enc setRenderPipelineState:pipeline];
    [enc setFragmentBytes:&u length:sizeof(u) atIndex:0];
    [enc drawPrimitives:MTLPrimitiveTypeTriangle vertexStart:0 vertexCount:3];
  }
  [enc endEncoding];
  [cmd presentDrawable:drawable];
  [cmd commit];
  return YES;
}

@end
