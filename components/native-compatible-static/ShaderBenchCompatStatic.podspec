require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

# @shader-bench/native-compatible-static — iOS part: the Fabric component <ShaderBenchCompatStaticView>
# (Metal). Autolinked by the React Native CLI (podspec at the package root).
#
# Shaders: every src/shaders/<name>/<name>.metal is compiled AT BUILD TIME
# (script phase below: `metal` + `metallib`) into <name>.metallib inside the
# pod's resource bundle ShaderBenchCompatStatic.bundle, which CocoaPods copies into
# the app. The view loads <shader>.metallib from that bundle.
Pod::Spec.new do |s|
  s.name         = "ShaderBenchCompatStatic"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/gre/effect-impl-study"
  s.license      = package["license"]
  s.authors      = "shader-bench"
  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/gre/effect-impl-study.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm}"
  s.frameworks   = "Metal", "QuartzCore"

  # The bundle needs one declared resource to exist; the .metallib files are
  # written into it by the script phase. (Do NOT list the .metal files as
  # resources: Xcode would also compile them all into one default.metallib.)
  s.resource_bundles = { "ShaderBenchCompatStatic" => ["ios/ShaderBenchCompatStatic.bundle.txt"] }

  s.script_phase = {
    :name => "[ShaderBenchCompatStatic] Compile Metal shaders",
    :execution_position => :before_compile,
    :shell_path => "/bin/sh",
    :script => <<~'SCRIPT'
      set -e
      OUT="${CONFIGURATION_BUILD_DIR}/ShaderBenchCompatStatic.bundle"
      AIR="${DERIVED_FILE_DIR}/shader-bench-air"
      mkdir -p "$OUT" "$AIR"
      case "$PLATFORM_NAME" in
        iphonesimulator) STD="-mios-simulator-version-min=${IPHONEOS_DEPLOYMENT_TARGET}" ;;
        *) STD="-mios-version-min=${IPHONEOS_DEPLOYMENT_TARGET}" ;;
      esac
      for SRC in "${PODS_TARGET_SRCROOT}"/src/shaders/*/*.metal; do
        NAME=$(basename "$SRC" .metal)
        xcrun -sdk "$PLATFORM_NAME" metal $STD -c "$SRC" -o "$AIR/$NAME.air"
        xcrun -sdk "$PLATFORM_NAME" metallib "$AIR/$NAME.air" -o "$OUT/$NAME.metallib"
        echo "ShaderBenchCompatStatic: $SRC -> $OUT/$NAME.metallib"
      done
    SCRIPT
  }

  install_modules_dependencies(s)
end
