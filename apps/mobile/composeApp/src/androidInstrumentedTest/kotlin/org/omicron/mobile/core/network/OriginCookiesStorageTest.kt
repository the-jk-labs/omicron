package org.omicron.mobile.core.network

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.cookies.HttpCookies
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.omicron.mobile.core.storage.SessionCookieStore
import org.omicron.mobile.core.storage.StoredSessionCookie

@RunWith(AndroidJUnit4::class)
class OriginCookiesStorageTest {
    @Test
    fun sendsAStoredSecureCookieToTheSameOrigin() = runBlocking {
        val store = FakeSessionCookieStore()
        var requestCount = 0
        val client =
            HttpClient(
                MockEngine { request ->
                    requestCount += 1
                    if (requestCount == 1) {
                        respond(
                            content = "{}",
                            status = HttpStatusCode.OK,
                            headers = headersOf(HttpHeaders.SetCookie, "omicron.session_token=session-token; Max-Age=3600; Path=/; Secure; HttpOnly"),
                        )
                    } else {
                        assertEquals("omicron.session_token=session-token", request.headers[HttpHeaders.Cookie])
                        respond("{}", HttpStatusCode.OK)
                    }
                },
            ) {
                install(HttpCookies) {
                    storage = OriginCookiesStorage(store)
                }
            }

        client.post("https://omicron.blog/api/auth/sign-in/username")
        client.get("https://omicron.blog/api/auth/get-session")
        client.close()
    }
}

private class FakeSessionCookieStore : SessionCookieStore {
    private val cookies = mutableMapOf<String, List<StoredSessionCookie>>()

    override suspend fun read(origin: String): List<StoredSessionCookie> = cookies[origin].orEmpty()

    override suspend fun write(origin: String, cookies: List<StoredSessionCookie>) {
        this.cookies[origin] = cookies
    }
}
