package org.omicron.mobile.data.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

interface AuthApi {
    suspend fun getSession(origin: String): AuthSessionDto?

    suspend fun getToken(origin: String): AuthTokenDto

    suspend fun signInEmail(origin: String, email: String, password: String): AuthSessionCreationDto

    suspend fun signInUsername(origin: String, username: String, password: String): AuthSessionCreationDto

    suspend fun signUpEmail(
        origin: String,
        email: String,
        password: String,
        username: String,
        displayName: String,
    ): AuthSessionCreationDto

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
    @SerialName("image") val avatarUrl: String? = null,
)

@Serializable
data class AuthTokenDto(
    val token: String,
)

@Serializable
data class AuthSessionCreationDto(
    val user: AuthUserDto,
    val token: String? = null,
)

@Serializable
data class EmailSignInRequestDto(
    val email: String,
    val password: String,
)

@Serializable
data class UsernameSignInRequestDto(
    val username: String,
    val password: String,
)

@Serializable
data class EmailSignUpRequestDto(
    val email: String,
    val password: String,
    val username: String,
    @SerialName("name") val displayName: String,
)

@Serializable
data class AuthErrorDto(
    val code: String? = null,
)

class AuthApiException(
    val code: String?,
) : Exception()
