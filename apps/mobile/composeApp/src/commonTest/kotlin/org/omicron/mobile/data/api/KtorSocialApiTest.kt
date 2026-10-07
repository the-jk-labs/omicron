package org.omicron.mobile.data.api

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.HttpRequestData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class KtorSocialApiTest {
    @Test
    fun postLikeSendsBearerAndDecodesAuthoritativeState() = runTest {
        var method: HttpMethod? = null
        var path = ""
        var authorization: String? = null
        val api =
            KtorSocialApi(
                client { request ->
                    method = request.method
                    path = request.url.encodedPath
                    authorization = request.headers[HttpHeaders.Authorization]
                    """{"likeCount":8,"liked":true}"""
                },
            )

        val state = api.postLike("https://omicron.blog", "post-1", true, "signed-token")

        assertEquals(HttpMethod.Post, method)
        assertEquals("/api/posts/post-1/like", path)
        assertEquals("Bearer signed-token", authorization)
        assertEquals(LikeStateDto(8, true), state)
    }

    @Test
    fun commentsKeepTheCursorOpaqueAndSendOptionalBearer() = runTest {
        var path = ""
        var query = ""
        var authorization: String? = null
        val api =
            KtorSocialApi(
                client { request ->
                    path = request.url.encodedPath
                    query = request.url.parameters["cursor"].orEmpty()
                    authorization = request.headers[HttpHeaders.Authorization]
                    """{"items":[],"nextCursor":"next"}"""
                },
            )

        val page = api.comments("https://omicron.blog", "post-1", "opaque/+cursor=", "viewer-token")

        assertEquals("/api/posts/post-1/comments", path)
        assertEquals("opaque/+cursor=", query)
        assertEquals("Bearer viewer-token", authorization)
        assertEquals("next", page.nextCursor)
    }

    @Test
    fun remoteProfileEncodesTheFediverseHandleAsOnePathSegment() = runTest {
        var path = ""
        val api =
            KtorSocialApi(
                client { request ->
                    path = request.url.encodedPath
                    REMOTE_PROFILE_JSON
                },
            )

        val profile = api.remoteProfile("https://omicron.blog", "writer@remote.example", null)

        assertEquals("/api/remote/users/writer@remote.example", path)
        assertEquals("remote.example", profile.user.host)
        assertEquals(42, profile.counts.followers)
        assertTrue(profile.user.tags.isEmpty())
    }

    @Test
    fun localFollowUsesReturnedPrivateAccountState() = runTest {
        var path = ""
        var method: HttpMethod? = null
        val api =
            KtorSocialApi(
                client { request ->
                    path = request.url.encodedPath
                    method = request.method
                    """{"ok":true,"state":"requested"}"""
                },
            )

        val state = api.setFollow("https://omicron.blog", "private_writer", false, true, "signed-token")

        assertEquals("/api/users/private_writer/follow", path)
        assertEquals(HttpMethod.Post, method)
        assertEquals("requested", state.state)
    }

    @Test
    fun readLaterAndListOperationsUseConfirmedEndpoints() = runTest {
        val calls = mutableListOf<Pair<HttpMethod, String>>()
        val api =
            KtorSocialApi(
                client { request ->
                    calls += request.method to request.url.encodedPath
                    when (request.url.encodedPath) {
                        "/api/lists/read-later" -> READ_LATER_JSON
                        else -> """{"ok":true}"""
                    }
                },
            )

        assertEquals("read-later", api.readLater("https://omicron.blog", "signed-token").list.id)
        api.addToList("https://omicron.blog", "read-later", "post-1", "signed-token")
        api.removeFromList("https://omicron.blog", "read-later", "post-1", "signed-token")

        assertEquals(
            listOf(
                HttpMethod.Get to "/api/lists/read-later",
                HttpMethod.Post to "/api/lists/read-later/items",
                HttpMethod.Delete to "/api/lists/read-later/items/post-1",
            ),
            calls,
        )
    }

    private fun client(handler: (HttpRequestData) -> String) =
        HttpClient(MockEngine { request ->
            respond(
                content = handler(request),
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, "application/json"),
            )
        }) {
            expectSuccess = true
            install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
        }

    private companion object {
        const val REMOTE_PROFILE_JSON =
            """{"user":{"id":"actor-1","username":"writer@remote.example","displayName":"Writer","bio":"","avatarUrl":null,"host":"remote.example","apId":"https://remote.example/@writer","remote":true,"tags":[]},"counts":{"followers":42,"following":12},"isFollowing":false,"isMuted":false,"isBlocked":false}"""

        const val READ_LATER_JSON =
            """{"list":{"id":"read-later","title":"Read later","description":"","visibility":"private","isReadLater":true,"itemCount":0,"createdAt":"2026-01-01T00:00:00Z"}}"""
    }
}
