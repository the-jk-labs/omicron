package org.omicron.mobile

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.cookies.HttpCookies
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import org.omicron.mobile.core.network.OriginCookiesStorage
import org.omicron.mobile.core.storage.SessionCookieStore

fun createHttpClient(cookieStore: SessionCookieStore): HttpClient =
    HttpClient(OkHttp) {
        expectSuccess = true
        followRedirects = false
        install(HttpCookies) {
            storage = OriginCookiesStorage(cookieStore)
        }
        install(HttpTimeout) {
            connectTimeoutMillis = 15_000
            requestTimeoutMillis = 15_000
            socketTimeoutMillis = 15_000
        }
        install(ContentNegotiation) {
            json(
                Json {
                    ignoreUnknownKeys = true
                },
            )
        }
    }
