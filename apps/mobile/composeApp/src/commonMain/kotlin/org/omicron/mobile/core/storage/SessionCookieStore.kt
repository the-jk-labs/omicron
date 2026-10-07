package org.omicron.mobile.core.storage

import kotlinx.serialization.Serializable

interface SessionCookieStore {
    suspend fun read(origin: String): List<StoredSessionCookie>

    suspend fun write(origin: String, cookies: List<StoredSessionCookie>)

    suspend fun clear(origin: String) = write(origin, emptyList())
}

@Serializable
data class StoredSessionCookie(
    val name: String,
    val value: String,
    val expiresAt: Long?,
    val encoding: String = "RAW",
)
