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
import kotlin.test.assertNull

class KtorPostsApiTest {
    @Test
    fun globalTimelineOmitsScopeAndPreservesCursor() = runTest {
        var requestPath = ""
        var requestQuery = ""
        val client =
            HttpClient(
                MockEngine {
                    requestPath = it.url.encodedPath
                    requestQuery = it.url.encodedQuery
                    respond(
                        content = TIMELINE_JSON,
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, "application/json"),
                    )
                },
            ) {
                install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
            }

        val page = KtorPostsApi(client).timeline("https://omicron.blog", TimelineScope.Global, null)

        assertEquals("/api/posts", requestPath)
        assertEquals("", requestQuery)
        assertEquals(1, page.items.size)
        assertEquals("opaque-cursor-1", page.nextCursor)
    }

    @Test
    fun localTimelineSendsScopeAndCursorUnchanged() = runTest {        var requestQuery = ""
        val client =
            HttpClient(
                MockEngine {
                    requestQuery = it.url.encodedQuery
                    respond(
                        content = """{"items":[],"nextCursor":null}""",
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, "application/json"),
                    )
                },
            ) {
                install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
            }

        val page = KtorPostsApi(client).timeline("https://omicron.blog/", TimelineScope.Local, "opaque-cursor-1")

        assertEquals("scope=local&cursor=opaque-cursor-1", requestQuery)
        assertNull(page.nextCursor)
    }

    @Test
    fun readsSinglePostWithCoverCredit() = runTest {
        var requestPath = ""
        val client =
            HttpClient(
                MockEngine {
                    requestPath = it.url.encodedPath
                    respond(
                        content = SINGLE_POST_JSON,
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, "application/json"),
                    )
                },
            ) {
                install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
            }

        val post = KtorPostsApi(client).post("https://omicron.blog", "post-1")

        assertEquals("/api/posts/post-1", requestPath)
        assertEquals("post-1", post.id)
        assertEquals("<p>Hello</p>", post.contentHtml)
        assertEquals("/uploads/cover.jpg", post.coverUrl)
        assertEquals("A. Photographer", post.coverCredit?.name)
    }

    @Test
    fun readsRelatedPosts() = runTest {
        var requestPath = ""
        val client =
            HttpClient(
                MockEngine {
                    requestPath = it.url.encodedPath
                    respond(
                        content = """{"items":[]}""",
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, "application/json"),
                    )
                },
            ) {
                install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
            }

        val items = KtorPostsApi(client).relatedPosts("https://omicron.blog", "post-1")

        assertEquals("/api/posts/post-1/related", requestPath)
        assertEquals(emptyList(), items)
    }

    @Test
    fun sendsBearerTokenWhenSignedIn() = runTest {
        var authorization: String? = null
        val client =
            HttpClient(
                MockEngine {
                    authorization = it.headers[HttpHeaders.Authorization]
                    respond(
                        content = """{"items":[],"nextCursor":null}""",
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, "application/json"),
                    )
                },
            ) {
                install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
            }

        KtorPostsApi(client).timeline("https://omicron.blog", TimelineScope.Global, null, "signed-token")

        assertEquals("Bearer signed-token", authorization)
    }

    @Test
    fun omitsAuthorizationHeaderForGuests() = runTest {
        var authorization: String? = "unset"
        val client =
            HttpClient(
                MockEngine {
                    authorization = it.headers[HttpHeaders.Authorization]
                    respond(
                        content = """{"items":[],"nextCursor":null}""",
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, "application/json"),
                    )
                },
            ) {
                install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
            }

        KtorPostsApi(client).timeline("https://omicron.blog", TimelineScope.Global, null)

        assertNull(authorization)
    }

    private companion object {
        const val TIMELINE_JSON =
            """{"items":[{"id":"post-1","title":"Hello","contentHtml":"<p>Hello</p>","remote":false,"summary":"A greeting","bannerUrl":"/api/uploads/cover.jpg","createdAt":"2026-01-01T00:00:00Z","author":{"id":"user-1","username":"alice","displayName":"Alice","avatarUrl":null,"remote":false},"tags":[{"slug":"intro","name":"Intro"}],"likeCount":3,"liked":false,"commentCount":1,"recommendCount":0,"recommended":false}],"nextCursor":"opaque-cursor-1"}"""

        const val SINGLE_POST_JSON =
            """{"post":{"id":"post-1","title":"Hello","contentHtml":"<p>Hello</p>","remote":false,"language":"en","coverUrl":"/uploads/cover.jpg","coverCredit":{"name":"A. Photographer","nameUrl":"https://example.com/a","source":"Example","sourceUrl":"https://example.com","license":null,"licenseUrl":null},"createdAt":"2026-01-01T00:00:00Z","author":{"id":"user-1","username":"alice","displayName":"Alice","avatarUrl":null,"remote":false},"tags":[],"likeCount":3,"liked":false,"commentCount":1,"recommendCount":0,"recommended":false}}"""
    }
}
