package org.omicron.mobile.data.api

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals

class KtorAuthApiTest {
    @Test
    fun readsTheSessionAndMintsItsToken() = runTest {
        val client =
            HttpClient(
                MockEngine { request ->
                    assertEquals("https://omicron.blog", request.headers[HttpHeaders.Origin])
                    when (request.url.encodedPath) {
                        "/api/auth/get-session" ->
                            respond(
                                content =
                                    """{"user":{"id":"user-1","email":"ada@example.com","username":"ada","name":"Ada"},"session":{}}""",
                                status = HttpStatusCode.OK,
                                headers = headersOf(HttpHeaders.ContentType, "application/json"),
                            )

                        "/api/auth/token" ->
                            respond(
                                content = """{"token":"signed-token"}""",
                                status = HttpStatusCode.OK,
                                headers = headersOf(HttpHeaders.ContentType, "application/json"),
                            )

                        else -> error("Unexpected request: ${request.url}")
                    }
                },
            ) {
                install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
            }

        val api = KtorAuthApi(client)

        assertEquals("ada", api.getSession("https://omicron.blog")?.user?.username)
        assertEquals("signed-token", api.getToken("https://omicron.blog").token)
    }

    @Test
    fun returnsNoSessionWhenTheServerReturnsNull() = runTest {
        val client =
            HttpClient(MockEngine { respond("null", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json")) }) {
                install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
            }

        assertEquals(null, KtorAuthApi(client).getSession("https://omicron.blog"))
    }
}
