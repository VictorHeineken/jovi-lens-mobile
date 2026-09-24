package expo.modules.jovinative

import android.Manifest
import android.content.ContentUris
import android.content.pm.PackageManager
import android.provider.CalendarContract
import androidx.core.content.ContextCompat
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
// read-only calendar queries. Integrity functions resolve or reject from Task
// listeners, so there is no coroutine dependency. The calendar functions only
// ever query content providers; they never write to any ContentResolver
// (tests/nativeReadOnly.test.js guards this).
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

    AsyncFunction("getAccountCalendars") { email: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null || !hasCalendarPermission()) {
        promise.reject("ERR_CALENDAR_PERMISSION", "READ_CALENDAR not granted", null)
      } else {
        val projection = arrayOf(
          CalendarContract.Calendars._ID,
          CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
          CalendarContract.Calendars.ACCOUNT_NAME,
          CalendarContract.Calendars.ACCOUNT_TYPE,
          CalendarContract.Calendars.OWNER_ACCOUNT,
          CalendarContract.Calendars.VISIBLE,
          CalendarContract.Calendars.SYNC_EVENTS,
          CalendarContract.Calendars.IS_PRIMARY,
        )
        val selection = "${CalendarContract.Calendars.ACCOUNT_TYPE} = ? AND LOWER(${CalendarContract.Calendars.ACCOUNT_NAME}) = LOWER(?)"
        val calendars = mutableListOf<Map<String, Any?>>()
        context.contentResolver.query(CalendarContract.Calendars.CONTENT_URI, projection, selection, arrayOf("com.google", email), null)?.use { cursor ->
          while (cursor.moveToNext()) {
            calendars.add(mapOf(
              "id" to cursor.getLong(0).toString(),
              "name" to (cursor.getString(1) ?: ""),
              "isPrimary" to (cursor.getInt(7) == 1),
              "visible" to (cursor.getInt(5) == 1),
              "synced" to (cursor.getInt(6) == 1),
            ))
          }
        }
        promise.resolve(calendars)
      }
    }

    AsyncFunction("getCalendarInstances") { calendarIds: List<String>, startMs: Double, endMs: Double, promise: Promise ->
      val context = appContext.reactContext
      if (context == null || !hasCalendarPermission()) {
        promise.reject("ERR_CALENDAR_PERMISSION", "READ_CALENDAR not granted", null)
      } else if (calendarIds.isEmpty()) {
        promise.resolve(emptyList<Map<String, Any?>>())
      } else {
        val builder = CalendarContract.Instances.CONTENT_URI.buildUpon()
        ContentUris.appendId(builder, startMs.toLong())
        ContentUris.appendId(builder, endMs.toLong())
        val projection = arrayOf(
          CalendarContract.Instances.EVENT_ID,
          CalendarContract.Instances.BEGIN,
          CalendarContract.Instances.END,
          CalendarContract.Instances.TITLE,
          CalendarContract.Instances.DESCRIPTION,
          CalendarContract.Instances.EVENT_LOCATION,
          CalendarContract.Instances.ALL_DAY,
          CalendarContract.Instances.CALENDAR_ID,
          CalendarContract.Instances.STATUS,
        )
        val placeholders = calendarIds.joinToString(",") { "?" }
        // 2 = CalendarContract.Events.STATUS_CANCELED
        val selection = "${CalendarContract.Instances.CALENDAR_ID} IN ($placeholders) AND ${CalendarContract.Instances.STATUS} != 2"
        val instances = mutableListOf<Map<String, Any?>>()
        context.contentResolver.query(builder.build(), projection, selection, calendarIds.toTypedArray(), "${CalendarContract.Instances.BEGIN} ASC")?.use { cursor ->
          while (cursor.moveToNext() && instances.size < MAX_INSTANCES) {
            instances.add(mapOf(
              "eventId" to cursor.getLong(0).toString(),
              "begin" to cursor.getLong(1).toDouble(),
              "end" to cursor.getLong(2).toDouble(),
              "title" to (cursor.getString(3) ?: ""),
              "description" to (cursor.getString(4) ?: ""),
              "location" to (cursor.getString(5) ?: ""),
              "allDay" to (cursor.getInt(6) == 1),
              "calendarId" to cursor.getLong(7).toString(),
            ))
          }
        }
        promise.resolve(instances)
      }
    }
  }

  private fun hasCalendarPermission(): Boolean {
    val context = appContext.reactContext ?: return false
    return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED
  }

  private companion object {
    const val MAX_INSTANCES = 300
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
