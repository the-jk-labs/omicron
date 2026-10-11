package org.omicron.mobile.data.api

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.HttpRequestData
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.http.content.TextContent
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class KtorSocialApiTest {
    @Test
    fun postLikesPassThePublicGatewayOriginCheckInBothDirections() = runTest {
        val api = KtorSocialApi(gatewayClient { request ->
            """{"likeCount":8,"liked":${request.method == HttpMethod.Post}}"""
        })

        assertEquals(LikeStateDto(8, true), api.postLike("https://omicron.blog", "post-1", true, "signed-token"))
        assertEquals(LikeStateDto(8, false), api.postLike("https://omicron.blog", "post-1", false, "signed-token"))
    }

    @Test
    fun recommendationsPassThePublicGatewayOriginCheckInBothDirections() = runTest {
        val api = KtorSocialApi(gatewayClient { request ->
            """{"recommendCount":3,"recommended":${request.method == HttpMethod.Post}}"""
        })

        assertEquals(RecommendationStateDto(3, true), api.postRecommendation("https://omicron.blog/", "post-1", true, "signed-token"))
        assertEquals(RecommendationStateDto(3, false), api.postRecommendation("https://omicron.blog/", "post-1", false, "signed-token"))
    }

    @Test
    fun commentLikesPassThePublicGatewayOriginCheckInBothDirections() = runTest {
        val api = KtorSocialApi(gatewayClient { request ->
            """{"likeCount":2,"liked":${request.method == HttpMethod.Post}}"""
        })

        assertEquals(LikeStateDto(2, true), api.commentLike("https://omicron.blog", "post-1", "comment-1", true, "signed-token"))
        assertEquals(LikeStateDto(2, false), api.commentLike("https://omicron.blog", "post-1", "comment-1", false, "signed-token"))
    }

    @Test
    fun socialOriginPreservesNonDefaultPortsAndOmitsDefaultPorts() = runTest {
        val origins = mutableListOf<String?>()
        val api = KtorSocialApi(client { request ->
            origins += request.headers[HttpHeaders.Origin]
            """{"likeCount":1,"liked":true}"""
        })

        api.postLike("https://instance.example:8443", "post-1", true, "signed-token")
        api.postLike("https://instance.example:443", "post-1", true, "signed-token")

        assertEquals(listOf<String?>("https://instance.example:8443", "https://instance.example"), origins)
    }

    @Test
    fun commentCreationAndEditingSendPlainTextJsonAndTheReplyIdentifier() = runTest {
        val bodies = mutableListOf<String>()
        val api = KtorSocialApi(client { request ->
            assertEquals("https://omicron.blog", request.headers[HttpHeaders.Origin])
            assertEquals("Bearer signed-token", request.headers[HttpHeaders.Authorization])
            assertEquals(ContentType.Application.Json, request.body.contentType?.withoutParameters())
            bodies += (request.body as TextContent).text
            if (request.method == HttpMethod.Post) {
                """{"comment":{"id":"comment-1","content":"A reply","createdAt":"2026-01-01T00:00:00Z","parentId":"parent-1","author":{"id":"user-1","username":"ada","displayName":"Ada"}}}"""
            } else {
                """{"comment":{"id":"comment-1","content":"Updated reply"}}"""
            }
        })

        assertEquals("parent-1", api.createComment("https://omicron.blog", "post-1", "Plain text\n<not html>", "parent-1", "signed-token").comment.parentId)
        assertEquals("Updated reply", api.editComment("https://omicron.blog", "post-1", "comment-1", "Updated reply", "signed-token").comment.content)
        assertEquals("Plain text\n<not html>", Json.parseToJsonElement(bodies[0]).jsonObject.getValue("content").jsonPrimitive.content)
        assertEquals("parent-1", Json.parseToJsonElement(bodies[0]).jsonObject.getValue("parentId").jsonPrimitive.content)
    }

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

    private fun gatewayClient(handler: (HttpRequestData) -> String) =
        HttpClient(MockEngine { request ->
            val origin = "${request.url.protocol.name}://${request.url.host}"
            val rejected = request.method == HttpMethod.Post &&
                request.body.contentType != ContentType.Application.Json &&
                request.headers[HttpHeaders.Origin] != origin
            respond(
                content = if (rejected) "Cross-site POST form submissions are forbidden" else handler(request),
                status = if (rejected) HttpStatusCode.Forbidden else HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, if (rejected) "text/plain" else "application/json"),
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
