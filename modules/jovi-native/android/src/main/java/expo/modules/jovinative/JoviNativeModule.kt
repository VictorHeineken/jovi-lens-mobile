package expo.modules.jovinative

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Play Integrity (M6) and read-only calendar queries (M7) are added here.
class JoviNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("JoviNative")
  }
}
