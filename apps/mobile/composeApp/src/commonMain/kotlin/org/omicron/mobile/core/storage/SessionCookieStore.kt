package org.omicron.mobile.core.storage

import kotlinx.serialization.Serializable

interface SessionCookieStore {
    suspend fun read(origin: String): List<StoredSessionCookie>

    suspend fun write(origin: String, cookies: List<StoredSessionCookie>)
}

@Serializable
data class StoredSessionCookie(
    val name: String,
    val value: String,
    val expiresAt: Long?,
)
