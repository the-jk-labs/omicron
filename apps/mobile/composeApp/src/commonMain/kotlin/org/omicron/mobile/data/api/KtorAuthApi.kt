package org.omicron.mobile.data.api

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.ResponseException
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType

class KtorAuthApi(
    private val client: HttpClient,
) : AuthApi {
    override suspend fun getSession(origin: String): AuthSessionDto? =
        authCall { client.get("$origin/api/auth/get-session") { header(HttpHeaders.Origin, origin) }.body() }

    override suspend fun getToken(origin: String): AuthTokenDto =
        authCall { client.get("$origin/api/auth/token") { header(HttpHeaders.Origin, origin) }.body() }

    override suspend fun signInEmail(origin: String, email: String, password: String): AuthSessionCreationDto =
        authCall {
            client
                .post("$origin/api/auth/sign-in/email") {
                    authRequest(origin)
                    setBody(EmailSignInRequestDto(email, password))
                }.body()
        }

    override suspend fun signInUsername(origin: String, username: String, password: String): AuthSessionCreationDto =
        authCall {
            client
                .post("$origin/api/auth/sign-in/username") {
                    authRequest(origin)
                    setBody(UsernameSignInRequestDto(username, password))
                }.body()
        }

    override suspend fun signUpEmail(
        origin: String,
        email: String,
        password: String,
        username: String,
        displayName: String,
    ): AuthSessionCreationDto =
        authCall {
            client
                .post("$origin/api/auth/sign-up/email") {
                    authRequest(origin)
                    setBody(EmailSignUpRequestDto(email, password, username, displayName))
                }.body()
        }

    override suspend fun signOut(origin: String) {
        authCall { client.post("$origin/api/auth/sign-out") { authRequest(origin) } }
    }

    private fun io.ktor.client.request.HttpRequestBuilder.authRequest(origin: String) {
        header(HttpHeaders.Origin, origin)
        contentType(ContentType.Application.Json)
    }

    private suspend fun <T> authCall(block: suspend () -> T): T =
        try {
            block()
        } catch (exception: ResponseException) {
            val error = runCatching { exception.response.body<AuthErrorDto>() }.getOrNull()
            throw AuthApiException(error?.code)
        }
}
