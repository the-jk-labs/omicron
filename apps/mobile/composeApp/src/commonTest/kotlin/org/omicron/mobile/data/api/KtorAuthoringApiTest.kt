package org.omicron.mobile.data.api

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.HttpRequestData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class KtorAuthoringApiTest {
    @Test
    fun createPostSendsHtmlAndOmitsUntouchedFields() = runTest {
        var method: HttpMethod? = null
        var path = ""
        var authorization: String? = null
        var bodyText = ""
        val api =
            KtorAuthoringApi(
                client(BARE_POST_JSON) { request ->
                    method = request.method
                    path = request.url.encodedPath
                    authorization = request.headers[HttpHeaders.Authorization]
                    bodyText = (request.body as TextContent).text
                },
            )

        val post =
            api.createPost(
                "https://omicron.blog/",
                CreatePostRequest(contentHtml = "<p>Hello</p>", status = "draft"),
                "signed-token",
            )

        assertEquals(HttpMethod.Post, method)
        assertEquals("/api/posts", path)
        assertEquals("Bearer signed-token", authorization)
        assertTrue(bodyText.contains("contentHtml"))
        assertTrue(bodyText.contains("Hello"))
        assertTrue(bodyText.contains("\"status\":\"draft\""))
        assertTrue(!bodyText.contains("contentJson"))
        assertTrue(!bodyText.contains("summary"))
        assertTrue(!bodyText.contains("coverUrl"))
        assertTrue(!bodyText.contains("tags"))
        assertTrue(!bodyText.contains("publishAt"))
        assertEquals("post-1", post.id)
        assertEquals("hello", post.slug)
    }

    @Test
    fun updatePostSendsOnlyChangedFields() = runTest {
        var method: HttpMethod? = null
        var path = ""
        var bodyText = ""
        val api =
            KtorAuthoringApi(
                client(BARE_POST_JSON) { request ->
                    method = request.method
                    path = request.url.encodedPath
                    bodyText = (request.body as TextContent).text
                },
            )

        api.updatePost(
            "https://omicron.blog",
            "post-1",
            UpdatePostRequest(title = "Hello", tags = listOf("technology")),
            "signed-token",
        )

        assertEquals(HttpMethod.Patch, method)
        assertEquals("/api/posts/post-1", path)
        assertTrue(bodyText.contains("\"title\":\"Hello\""))
        assertTrue(bodyText.contains("technology"))
        assertTrue(!bodyText.contains("contentHtml"))
        assertTrue(!bodyText.contains("status"))
        assertTrue(!bodyText.contains("contentJson"))
    }

    @Test
    fun deletePostNotifiesOnlyWhenRequested() = runTest {
        val queries = mutableListOf<String?>()
        val api =
            KtorAuthoringApi(
                client("""{"ok":true}""") { request ->
                    queries += request.url.parameters["notify"]
                },
            )

        api.deletePost("https://omicron.blog", "post-1", false, "signed-token")
        api.deletePost("https://omicron.blog", "post-1", true, "signed-token")

        assertEquals(listOf(null, "true"), queries)
    }

    @Test
    fun draftsAndOwnPostsPreserveCursorsUnchanged() = runTest {
        val paths = mutableListOf<String>()
        val queries = mutableListOf<String>()
        val api =
            KtorAuthoringApi(
                client("""{"items":[],"nextCursor":"opaque-next"}""") { request ->
                    paths += request.url.encodedPath
                    queries += request.url.encodedQuery
                },
            )

        val drafts = api.drafts("https://omicron.blog", "opaque-cursor-1", "signed-token")
        val mine = api.ownPosts("https://omicron.blog", "scheduled", "opaque-cursor-2", "signed-token")

        assertEquals(listOf("/api/posts/drafts", "/api/posts/mine"), paths)
        assertTrue(queries[0].contains("cursor=opaque-cursor-1"))
        assertTrue(queries[1].contains("status=scheduled"))
        assertTrue(queries[1].contains("cursor=opaque-cursor-2"))
        assertEquals("opaque-next", drafts.nextCursor)
        assertEquals("opaque-next", mine.nextCursor)
    }

    @Test
    fun ownCountsReadsTabBadges() = runTest {
        var path = ""
        val api =
            KtorAuthoringApi(
                client("""{"draft":2,"scheduled":1,"published":5}""") { request ->
                    path = request.url.encodedPath
                },
            )

        val counts = api.ownCounts("https://omicron.blog", "signed-token")

        assertEquals("/api/posts/mine/counts", path)
        assertEquals(OwnCountsDto(draft = 2, scheduled = 1, published = 5), counts)
    }

    @Test
    fun uploadImageSendsRawBytesWithContentType() = runTest {
        var path = ""
        var contentType = ""
        var contentLength: Long? = null
        var authorization: String? = null
        val api =
            KtorAuthoringApi(
                client("""{"url":"/api/uploads/photo-1.png"}""") { request ->
                    path = request.url.encodedPath
                    contentType = request.body.contentType.toString()
                    contentLength = request.body.contentLength
                    authorization = request.headers[HttpHeaders.Authorization]
                },
            )

        val response = api.uploadImage("https://omicron.blog", byteArrayOf(1, 2, 3), "image/png", "signed-token")

        assertEquals("/api/uploads", path)
        assertTrue(contentType.startsWith("image/png"))
        assertEquals(3, contentLength)
        assertEquals("Bearer signed-token", authorization)
        assertEquals("/api/uploads/photo-1.png", response.url)
    }

    private fun client(
        content: String,
        onRequest: (HttpRequestData) -> Unit,
    ): HttpClient =
        HttpClient(MockEngine { request ->
            onRequest(request)
            respond(
                content = content,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, "application/json"),
            )
        }) {
            expectSuccess = true
            install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
        }

    private companion object {
        const val BARE_POST_JSON =
            """{"post":{"id":"post-1","title":"Hello","slug":"hello","contentHtml":"<p>Hello</p>","status":"draft","publishAt":null,"language":"en","summary":null,"coverUrl":null,"bannerUrl":null,"coverCredit":null,"createdAt":"2026-01-01T00:00:00Z"}}"""
    }
}
