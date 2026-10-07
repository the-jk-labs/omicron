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
    fun localTimelineSendsScopeAndCursorUnchanged() = runTest {
        var requestQuery = ""
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

    private companion object {
        const val TIMELINE_JSON =
            """{"items":[{"id":"post-1","title":"Hello","contentHtml":"<p>Hello</p>","remote":false,"summary":"A greeting","bannerUrl":"/api/uploads/cover.jpg","createdAt":"2026-01-01T00:00:00Z","author":{"id":"user-1","username":"alice","displayName":"Alice","avatarUrl":null,"remote":false},"tags":[{"slug":"intro","name":"Intro"}],"likeCount":3,"liked":false,"commentCount":1,"recommendCount":0,"recommended":false}],"nextCursor":"opaque-cursor-1"}"""
    }
}
