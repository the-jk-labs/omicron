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
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class KtorMobileWebApiTest {
    @Test
    fun listsUseConfirmedPathsAndBearerTransport() = runTest {
        val calls = mutableListOf<Pair<HttpMethod, String>>()
        val api = KtorMobileWebApi(client { request ->
            calls += request.method to request.url.encodedPath
            when (request.url.encodedPath) {
                "/api/lists" -> LISTS_JSON
                "/api/lists/list-1" -> LIST_DETAIL_JSON
                else -> POSTS_PAGE_JSON
            }
        })

        val lists = api.myLists("https://omicron.blog/", "token")
        val detail = api.listDetail("https://omicron.blog", "list-1", "token")
        val page = api.listItems("https://omicron.blog", "list-1", "opaque/+cursor=", "token")

        assertEquals(1, lists.lists.size)
        assertEquals("owner", detail.owner.username)
        assertEquals("next-cursor", page.nextCursor)
        assertEquals(
            listOf(
                HttpMethod.Get to "/api/lists",
                HttpMethod.Get to "/api/lists/list-1",
                HttpMethod.Get to "/api/lists/list-1/items",
            ),
            calls,
        )
    }

    @Test
    fun dashboardClampsRangeAndNotificationsKeepCursorOpaque() = runTest {
        var dashboardDays: String? = null
        var notificationCursor: String? = null
        var authorization: String? = null
        val api = KtorMobileWebApi(client { request ->
            if (request.url.encodedPath == "/api/dashboard") dashboardDays = request.url.parameters["days"]
            if (request.url.encodedPath == "/api/notifications") notificationCursor = request.url.parameters["cursor"]
            authorization = request.headers[HttpHeaders.Authorization]
            when (request.url.encodedPath) {
                "/api/dashboard" -> DASHBOARD_JSON
                else -> NOTIFICATIONS_JSON
            }
        })

        val dashboard = api.dashboard("https://omicron.blog", 500, "signed-token")
        val page = api.notifications("https://omicron.blog", "opaque/+cursor=", "signed-token")

        assertEquals("365", dashboardDays)
        assertEquals("opaque/+cursor=", notificationCursor)
        assertEquals("Bearer signed-token", authorization)
        assertEquals(12, dashboard.totals.views)
        assertEquals("like", page.items.single().type)
    }

    @Test
    fun createAndReadOperationsUseJsonAndNotificationRoutes() = runTest {
        val requests = mutableListOf<HttpRequestData>()
        val api = KtorMobileWebApi(client { request ->
            requests += request
            when (request.url.encodedPath) {
                "/api/lists" -> SINGLE_LIST_JSON
                "/api/notifications/unread-count" -> """{"count":3}"""
                else -> """{"ok":true}"""
            }
        })

        val created = api.createList("https://omicron.blog", CreateListRequestDto("Travel", "Notes", "private"), "token")
        val unread = api.unreadNotificationCount("https://omicron.blog", "token")
        api.markAllNotificationsRead("https://omicron.blog", "token")
        api.markNotificationRead("https://omicron.blog", "notification-1", "token")

        assertEquals("Travel", created.list.title)
        assertEquals(3, unread.count)
        assertEquals(HttpMethod.Post, requests.first().method)
        val body = requests.first().body as TextContent
        assertEquals(ContentType.Application.Json, body.contentType)
        assertTrue(body.text.contains("\"title\":\"Travel\""))
        assertEquals("/api/notifications/read", requests[2].url.encodedPath)
        assertEquals("/api/notifications/notification-1/read", requests[3].url.encodedPath)
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
        const val LISTS_JSON =
            """{"lists":[{"id":"list-1","title":"Travel","description":"Notes","visibility":"private","isReadLater":false,"itemCount":2,"createdAt":"2026-01-01T00:00:00Z"}]}"""
        const val SINGLE_LIST_JSON =
            """{"list":{"id":"list-1","title":"Travel","description":"Notes","visibility":"private","isReadLater":false,"itemCount":0,"createdAt":"2026-01-01T00:00:00Z"}}"""
        const val LIST_DETAIL_JSON =
            """{"list":{"id":"list-1","title":"Travel","description":"Notes","visibility":"private","isReadLater":false,"itemCount":2,"createdAt":"2026-01-01T00:00:00Z"},"isOwner":true,"owner":{"username":"owner","displayName":"Owner"}}"""
        const val POSTS_PAGE_JSON = """{"items":[],"nextCursor":"next-cursor"}"""
        const val DASHBOARD_JSON =
            """{"onInstanceViews":true,"totals":{"views":12,"likes":4,"comments":2,"followers":9},"series":[{"day":"2026-01-01","views":12}],"posts":[]}"""
        const val NOTIFICATIONS_JSON =
            """{"items":[{"id":"notification-1","type":"like","actor":{"id":"actor-1","username":"alice","displayName":"Alice","avatarUrl":null,"remote":false},"postId":"post-1","postTitle":"Hello","commentSnippet":null,"read":false,"createdAt":"2026-01-01T00:00:00Z"}],"nextCursor":null}"""
    }
}
