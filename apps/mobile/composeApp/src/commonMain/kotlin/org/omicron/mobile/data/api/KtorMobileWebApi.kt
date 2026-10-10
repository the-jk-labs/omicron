package org.omicron.mobile.data.api

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.encodeURLPathPart

class KtorMobileWebApi(
    private val client: HttpClient,
) : MobileWebApi {
    override suspend fun myLists(
        origin: String,
        accessToken: String,
    ): ReadingListsDto =
        client.get("${origin.trimEnd('/')}/api/lists") {
            authorized(accessToken)
        }.body()

    override suspend fun createList(
        origin: String,
        request: CreateListRequestDto,
        accessToken: String,
    ): ReadingListEnvelopeDto =
        client.post("${origin.trimEnd('/')}/api/lists") {
            authorized(accessToken)
            contentType(ContentType.Application.Json)
            setBody(request)
        }.body()

    override suspend fun listDetail(
        origin: String,
        listId: String,
        accessToken: String,
    ): ReadingListDetailDto =
        client.get("${origin.trimEnd('/')}/api/lists/${listId.pathPart()}") {
            authorized(accessToken)
        }.body()

    override suspend fun listItems(
        origin: String,
        listId: String,
        cursor: String?,
        accessToken: String,
    ): TimelinePageDto =
        client.get("${origin.trimEnd('/')}/api/lists/${listId.pathPart()}/items") {
            authorized(accessToken)
            cursor?.let { parameter("cursor", it) }
        }.body()

    override suspend fun dashboard(
        origin: String,
        days: Int,
        accessToken: String,
    ): DashboardSummaryDto =
        client.get("${origin.trimEnd('/')}/api/dashboard") {
            authorized(accessToken)
            parameter("days", days.coerceIn(1, 365))
        }.body()

    override suspend fun notifications(
        origin: String,
        cursor: String?,
        accessToken: String,
    ): NotificationPageDto =
        client.get("${origin.trimEnd('/')}/api/notifications") {
            authorized(accessToken)
            cursor?.let { parameter("cursor", it) }
        }.body()

    override suspend fun unreadNotificationCount(
        origin: String,
        accessToken: String,
    ): UnreadNotificationCountDto =
        client.get("${origin.trimEnd('/')}/api/notifications/unread-count") {
            authorized(accessToken)
        }.body()

    override suspend fun markAllNotificationsRead(
        origin: String,
        accessToken: String,
    ) {
        client.post("${origin.trimEnd('/')}/api/notifications/read") {
            authorized(accessToken)
        }
    }

    override suspend fun markNotificationRead(
        origin: String,
        notificationId: String,
        accessToken: String,
    ) {
        client.post("${origin.trimEnd('/')}/api/notifications/${notificationId.pathPart()}/read") {
            authorized(accessToken)
        }
    }

    private fun io.ktor.client.request.HttpRequestBuilder.authorized(accessToken: String) {
        header(HttpHeaders.Authorization, "Bearer $accessToken")
    }

    private fun String.pathPart() = encodeURLPathPart()
}
