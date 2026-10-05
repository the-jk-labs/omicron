package org.omicron.mobile.data.api

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.http.HttpHeaders

class KtorAuthApi(
    private val client: HttpClient,
) : AuthApi {
    override suspend fun getSession(origin: String): AuthSessionDto? =
        client.get("$origin/api/auth/get-session") { header(HttpHeaders.Origin, origin) }.body()

    override suspend fun getToken(origin: String): AuthTokenDto =
        client.get("$origin/api/auth/token") { header(HttpHeaders.Origin, origin) }.body()

    override suspend fun signOut(origin: String) {
        client.post("$origin/api/auth/sign-out") { header(HttpHeaders.Origin, origin) }
    }
}
