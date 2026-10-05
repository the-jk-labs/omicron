package org.omicron.mobile.core.storage

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class EncryptedSessionCookieStore(
    context: Context,
) : SessionCookieStore {
    private val preferences = context.getSharedPreferences("auth_cookies", Context.MODE_PRIVATE)
    private val json = Json

    override suspend fun read(origin: String): List<StoredSessionCookie> =
        withContext(Dispatchers.IO) {
            val value = preferences.getString(origin, null) ?: return@withContext emptyList()
            runCatching { json.decodeFromString<List<StoredSessionCookie>>(decrypt(value)) }
                .getOrElse {
                    preferences.edit().remove(origin).apply()
                    emptyList()
                }
        }

    override suspend fun write(origin: String, cookies: List<StoredSessionCookie>) {
        withContext(Dispatchers.IO) {
            preferences
                .edit()
                .apply {
                    if (cookies.isEmpty()) remove(origin) else putString(origin, encrypt(json.encodeToString(cookies)))
                }.apply()
        }
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val encrypted = cipher.doFinal(value.encodeToByteArray())
        return "${Base64.encodeToString(cipher.iv, Base64.NO_WRAP)}:${Base64.encodeToString(encrypted, Base64.NO_WRAP)}"
    }

    private fun decrypt(value: String): String {
        val (encodedIv, encodedContent) = value.split(':', limit = 2)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            secretKey(),
            javax.crypto.spec.GCMParameterSpec(128, Base64.decode(encodedIv, Base64.NO_WRAP)),
        )
        return cipher.doFinal(Base64.decode(encodedContent, Base64.NO_WRAP)).decodeToString()
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey?.let { return it }
        return KeyGenerator
            .getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            .apply {
                init(
                    KeyGenParameterSpec
                        .Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .build(),
                )
            }.generateKey()
    }

    private companion object {
        const val KEY_ALIAS = "omicron.auth.cookies"
    }
}
