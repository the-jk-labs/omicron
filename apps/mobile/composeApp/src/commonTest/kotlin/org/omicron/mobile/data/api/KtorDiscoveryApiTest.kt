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
import kotlin.test.assertTrue

class KtorDiscoveryApiTest {
    @Test
    fun searchSendsQueryAndFilters() = runTest {
        var requestPath = ""
        var requestQuery = ""
        var authorization: String? = "unset"
        val client = mockClient(SEARCH_JSON) { request ->
            requestPath = request.url.encodedPath
            requestQuery = request.url.encodedQuery
            authorization = request.headers[HttpHeaders.Authorization]
        }

        val results =
            KtorDiscoveryApi(client).search(
                origin = "https://omicron.blog/",
                query = "federation",
                scope = null,
                tag = "technology",
                author = "alice",
                accessToken = "signed-token",
            )

        assertEquals("/api/search", requestPath)
        assertTrue(requestQuery.contains("q=federation"))
        assertTrue(requestQuery.contains("tag=technology"))
        assertTrue(requestQuery.contains("author=alice"))
        assertEquals("Bearer signed-token", authorization)
        assertEquals(1, results.posts.size)
        assertEquals(1, results.people.size)
        assertEquals(1, results.tags.size)
    }

    @Test
    fun searchSendsScopeWireValueAndOmitsBlankFilters() = runTest {
        var requestQuery = ""
        val client = mockClient(SEARCH_JSON) { request -> requestQuery = request.url.encodedQuery }

        KtorDiscoveryApi(client).search(
            origin = "https://omicron.blog",
            query = "hello",
            scope = SearchScope.Articles,
            tag = "  ",
            author = null,
        )

        assertTrue(requestQuery.contains("scope=posts"))
        assertTrue(!requestQuery.contains("tag="))
        assertTrue(!requestQuery.contains("author="))
    }

    @Test
    fun trendingPostsHitsTrendingPathWithoutCursor() = runTest {
        var requestPath = ""
        var requestQuery = ""
        val client =
            mockClient("""{"items":[]}""") { request ->
                requestPath = request.url.encodedPath
                requestQuery = request.url.encodedQuery
            }

        val items = KtorDiscoveryApi(client).trendingPosts("https://omicron.blog")

        assertEquals("/api/posts/trending", requestPath)
        assertEquals("", requestQuery)
        assertEquals(emptyList(), items)
    }

    @Test
    fun trendingTagsAndSuggestedUsersAreUnpaginated() = runTest {
        var paths = emptyList<String>()
        val tagsClient = mockClient(TRENDING_TAGS_JSON) { request -> paths += request.url.encodedPath }
        val peopleClient = mockClient(SUGGESTED_JSON) { request -> paths += request.url.encodedPath }

        val tags = KtorDiscoveryApi(tagsClient).trendingTags("https://omicron.blog")
        val people = KtorDiscoveryApi(peopleClient).suggestedUsers("https://omicron.blog")

        assertEquals(listOf("/api/tags", "/api/users/suggested"), paths)
        assertEquals(1, tags.size)
        assertEquals(7, tags.first().postCount)
        assertEquals(12, people.first().followerCount)
    }

    @Test
    fun tagPostsPreservesCursorUnchanged() = runTest {
        var requestPath = ""
        var requestQuery = ""
        val client =
            mockClient("""{"items":[],"nextCursor":null}""") { request ->
                requestPath = request.url.encodedPath
                requestQuery = request.url.encodedQuery
            }

        val page = KtorDiscoveryApi(client).tagPosts("https://omicron.blog", "technology", "opaque-cursor-1")

        assertEquals("/api/tags/technology/posts", requestPath)
        assertEquals("cursor=opaque-cursor-1", requestQuery)
        assertNull(page.nextCursor)
    }

    @Test
    fun tagDetailReadsCountsAndFollowState() = runTest {
        var requestPath = ""
        val client = mockClient(TAG_DETAIL_JSON) { request -> requestPath = request.url.encodedPath }

        val detail = KtorDiscoveryApi(client).tagDetail("https://omicron.blog", "technology")

        assertEquals("/api/tags/technology", requestPath)
        assertEquals("technology", detail.tag.slug)
        assertEquals(4, detail.postCount)
        assertEquals(9, detail.followerCount)
        assertEquals(false, detail.isFollowing)
    }

    private fun mockClient(
        content: String,
        onRequest: (io.ktor.client.engine.mock.MockRequestHandleScope.(io.ktor.client.request.HttpRequestData) -> Unit)? = null,
    ): HttpClient =
        HttpClient(
            MockEngine { request ->
                onRequest?.invoke(this, request)
                respond(
                    content = content,
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json"),
                )
            },
        ) {
            install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
        }

    private companion object {
        const val SEARCH_JSON =
            """{"posts":[{"id":"post-1","title":"Hello","contentHtml":"<p>Hello</p>","remote":false,"createdAt":"2026-01-01T00:00:00Z","author":{"id":"user-1","username":"alice","displayName":"Alice","avatarUrl":null,"remote":false},"tags":[],"likeCount":0,"liked":false,"commentCount":0,"recommendCount":0,"recommended":false}],"people":[{"id":"user-1","username":"alice","displayName":"Alice","avatarUrl":null,"remote":false}],"tags":[{"slug":"technology","name":"Technology","postCount":4}]}"""

        const val TRENDING_TAGS_JSON = """{"tags":[{"slug":"technology","name":"Technology","postCount":7}]}"""

        const val SUGGESTED_JSON =
            """{"items":[{"id":"user-2","username":"bob","displayName":"Bob","avatarUrl":null,"remote":false,"followerCount":12}]}"""

        const val TAG_DETAIL_JSON =
            """{"tag":{"slug":"technology","name":"Technology"},"postCount":4,"followerCount":9,"isFollowing":false}"""
    }
}
