package expo.modules.jovinative

import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.StandardIntegrityException
import com.google.android.play.core.integrity.StandardIntegrityManager.PrepareIntegrityTokenRequest
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenProvider
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenRequest
import com.google.android.play.core.integrity.model.StandardIntegrityErrorCode
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Android-only helpers for JOVI Lens: Play Integrity standard requests and
// (in M7) read-only calendar queries. Every function resolves or rejects from
// Task listeners, so there is no coroutine dependency.
class JoviNativeModule : Module() {
  private var integrityTokenProvider: StandardIntegrityTokenProvider? = null

  override fun definition() = ModuleDefinition {
    Name("JoviNative")

    AsyncFunction("prepareIntegrity") { cloudProjectNumber: String, promise: Promise ->
      val context = appContext.reactContext
      val projectNumber = cloudProjectNumber.toLongOrNull()
      if (context == null) {
        promise.reject("ERR_INTEGRITY_NO_CONTEXT", "Android context unavailable", null)
      } else if (projectNumber == null) {
        promise.reject("ERR_INTEGRITY_PROJECT_NUMBER", "Invalid cloud project number", null)
      } else {
        IntegrityManagerFactory.createStandard(context)
          .prepareIntegrityToken(PrepareIntegrityTokenRequest.builder().setCloudProjectNumber(projectNumber).build())
          .addOnSuccessListener { provider ->
            integrityTokenProvider = provider
            promise.resolve(null)
          }
          .addOnFailureListener { error -> promise.reject(integrityErrorCode(error), error.message, error) }
      }
    }

    AsyncFunction("requestIntegrityToken") { requestHash: String, promise: Promise ->
      val provider = integrityTokenProvider
      if (provider == null) {
        promise.reject("ERR_INTEGRITY_NOT_PREPARED", "Integrity token provider not prepared", null)
      } else {
        provider.request(StandardIntegrityTokenRequest.builder().setRequestHash(requestHash).build())
          .addOnSuccessListener { response -> promise.resolve(response.token()) }
          .addOnFailureListener { error -> promise.reject(integrityErrorCode(error), error.message, error) }
      }
    }
  }

  private fun integrityErrorCode(error: Exception): String {
    if (error !is StandardIntegrityException) return "ERR_INTEGRITY_UNKNOWN"
    return if (error.errorCode == StandardIntegrityErrorCode.INTEGRITY_TOKEN_PROVIDER_INVALID) {
      "ERR_INTEGRITY_PROVIDER_INVALID"
    } else {
      "ERR_INTEGRITY_${error.errorCode}"
    }
  }
}
