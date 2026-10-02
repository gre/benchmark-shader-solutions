require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

# @shader-bench/native-compatible-dynamic — iOS part: the Fabric component
# <ShaderBenchCompatDynamicView> (Metal). Autolinked by the React Native CLI
# (podspec at the package root).
#
# Shaders: nothing to compile or bundle here. The Metal Shading Language
# source comes from JS (the `source` prop, src/shaders/<name>/sources.ios.ts)
# and is compiled at runtime (MTLDevice newLibraryWithSource), so adding or
# editing a shader needs no iOS rebuild.
Pod::Spec.new do |s|
  s.name         = "ShaderBenchCompatDynamic"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/gre/effect-impl-study"
  s.license      = package["license"]
  s.authors      = "shader-bench"
  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/gre/effect-impl-study.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm}"
  s.frameworks   = "Metal", "QuartzCore"

  install_modules_dependencies(s)
end
