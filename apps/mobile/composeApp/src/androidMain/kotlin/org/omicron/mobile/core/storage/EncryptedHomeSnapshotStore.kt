package org.omicron.mobile.core.storage

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.omicron.mobile.domain.model.HomeSnapshot

class EncryptedHomeSnapshotStore(
    context: Context,
    private val fileName: String = "home_snapshot",
    private val keyAlias: String = "omicron.home.snapshot",
) : HomeSnapshotStore {
    private val file = File(context.noBackupFilesDir, fileName)
    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun read(): HomeSnapshot? = withContext(Dispatchers.IO) {
        if (!file.exists()) return@withContext null
        if (file.length() > HomeSnapshotStore.MAX_BYTES + 64) {
            file.delete()
            return@withContext null
        }
        try {
            val bytes = file.readBytes()
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
            json.decodeFromString<HomeSnapshot>(cipher.doFinal(bytes.copyOfRange(12, bytes.size)).decodeToString())
        } catch (_: Exception) {
            file.delete()
            null
        }
    }

    override suspend fun write(snapshot: HomeSnapshot) = withContext(Dispatchers.IO) {
        val bytes = json.encodeToString(snapshot).encodeToByteArray()
        require(bytes.size <= HomeSnapshotStore.MAX_BYTES)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val temporary = File(file.parentFile, "$fileName.tmp")
        temporary.outputStream().use { output ->
            output.write(cipher.iv)
            output.write(cipher.doFinal(bytes))
        }
        check(temporary.renameTo(file))
    }

    override suspend fun clear() = withContext(Dispatchers.IO) {
        file.delete()
        File(file.parentFile, "$fileName.tmp").delete()
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (keyStore.containsAlias(keyAlias)) keyStore.deleteEntry(keyAlias)
        Unit
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getEntry(keyAlias, null) as? KeyStore.SecretKeyEntry)?.secretKey?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(
                KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build(),
            )
        }.generateKey()
    }
}
