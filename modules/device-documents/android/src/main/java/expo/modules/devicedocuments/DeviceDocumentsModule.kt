package expo.modules.devicedocuments

import android.content.ContentUris
import android.net.Uri
import android.provider.MediaStore
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Lists documents from Android's MediaStore index, which already knows every file in
 * shared storage. One query replaces walking every folder, so it takes well under a
 * second even on phones with many thousands of photos.
 */
class DeviceDocumentsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DeviceDocuments")

    // Runs off the JS thread.
    AsyncFunction("listDocuments") { extensions: List<String> ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val collection = MediaStore.Files.getContentUri("external")
      val projection = arrayOf(
        MediaStore.Files.FileColumns._ID,
        MediaStore.Files.FileColumns.DATA,
        MediaStore.Files.FileColumns.DISPLAY_NAME,
        MediaStore.Files.FileColumns.SIZE,
        MediaStore.Files.FileColumns.DATE_MODIFIED,
      )
      // LIKE is case-insensitive for ASCII in SQLite, so ".PDF" matches too. The path
      // is matched as well because older Android versions leave the name empty for
      // files that aren't photos, videos or music.
      val nameMatches = extensions.joinToString(" OR ") {
        "${MediaStore.Files.FileColumns.DISPLAY_NAME} LIKE ? OR ${MediaStore.Files.FileColumns.DATA} LIKE ?"
      }
      val selection = "($nameMatches) AND ${MediaStore.Files.FileColumns.SIZE} > 0"
      val args = extensions.flatMap { listOf("%.$it", "%.$it") }.toTypedArray()
      val order = "${MediaStore.Files.FileColumns.DATE_MODIFIED} DESC"

      val results = mutableListOf<Map<String, Any?>>()
      context.contentResolver.query(collection, projection, selection, args, order)?.use { cursor ->
        val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID)
        val dataColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATA)
        val nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
        val sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
        val modifiedColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_MODIFIED)
        while (cursor.moveToNext()) {
          val path: String? = cursor.getString(dataColumn)
          val name = cursor.getString(nameColumn) ?: path?.substringAfterLast('/') ?: continue
          // A file path works with expo-file-system once file access is allowed;
          // the content URI is a fallback for entries without one.
          val uri = if (path != null && File(path).exists()) {
            Uri.fromFile(File(path)).toString()
          } else {
            ContentUris.withAppendedId(collection, cursor.getLong(idColumn)).toString()
          }
          results.add(
            mapOf(
              "uri" to uri,
              "path" to path,
              "name" to name,
              "size" to cursor.getLong(sizeColumn).toDouble(),
              "modified" to cursor.getLong(modifiedColumn).toDouble() * 1000,
            )
          )
        }
      }
      results
    }
  }
}
