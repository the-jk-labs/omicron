package org.omicron.mobile.data.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

interface AuthApi {
    suspend fun getSession(origin: String): AuthSessionDto?

    suspend fun getToken(origin: String): AuthTokenDto

    suspend fun signOut(origin: String)
}

@Serializable
data class AuthSessionDto(
    val user: AuthUserDto,
    val session: JsonObject,
)

@Serializable
data class AuthUserDto(
    val id: String,
    val email: String,
    val username: String,
    @SerialName("name") val displayName: String,
)

@Serializable
data class AuthTokenDto(
    val token: String,
)
