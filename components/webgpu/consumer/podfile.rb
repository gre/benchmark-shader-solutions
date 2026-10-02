# @shader-bench/webgpu — iOS build fix for react-native-webgpu 0.5.17 with
# React Native 0.87 (prebuilt core). A library cannot change another pod's
# build settings from its podspec, so the consumer's Podfile calls this from
# its post_install block:
#
#   require_relative '../node_modules/@shader-bench/webgpu/consumer/podfile'
#   ...
#   post_install do |installer|
#     react_native_post_install(...)
#     shader_bench_webgpu_post_install(installer)
#   end
#
# Why (from apps/rn-webgpu): react-native-webgpu's `#include "ArrayBuffer.h"`
# (its own cpp/rnwgpu/ArrayBuffer.h) is resolved by Xcode's project header
# map to RN's react/bridging/ArrayBuffer.h -> "unknown type name
# 'ArrayBuffer'". Disabling header maps for that pod fixes it; the two
# unprefixed imports of apple/WebGPUView.mm that only resolved through the
# header map (RCTFabricComponentsPlugins.h, "Utils.h") get explicit paths.
def shader_bench_webgpu_post_install(installer)
  installer.pods_project.targets.each do |t|
    next unless t.name == 'react-native-webgpu'
    t.build_configurations.each do |c|
      c.build_settings['USE_HEADERMAP'] = 'NO'
      c.build_settings['HEADER_SEARCH_PATHS'] =
        ['$(inherited)', '"${PODS_ROOT}/Headers/Public/React-RCTFabric/React"',
         '"${PODS_ROOT}/React-Core-prebuilt/Headers/react/renderer/animations"']
    end
  end
end
