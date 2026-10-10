package org.omicron.mobile.feature.navigation

import org.omicron.mobile.data.api.CreateListRequestDto
import org.omicron.mobile.data.api.DashboardSummaryDto
import org.omicron.mobile.data.api.MobileWebApi
import org.omicron.mobile.data.api.NotificationPageDto
import org.omicron.mobile.data.api.PostAuthorDto
import org.omicron.mobile.data.api.PostDto
import org.omicron.mobile.data.api.PostStatDto
import org.omicron.mobile.data.api.ReadingListDetailDto
import org.omicron.mobile.data.api.ReadingListDto
import org.omicron.mobile.data.api.ReadingListEnvelopeDto
import org.omicron.mobile.data.api.ReadingListOwnerDto
import org.omicron.mobile.data.api.ReadingListsDto
import org.omicron.mobile.data.api.TimelinePageDto
import org.omicron.mobile.data.api.UnreadNotificationCountDto
import org.omicron.mobile.domain.model.InstanceConfiguration

internal class FakeMobileWebApi : MobileWebApi {
    var lists = listOf(readingList("read-later", "Read later", isReadLater = true))
    var createdList: ReadingListDto? = null
    var listPosts = emptyList<PostDto>()
    var dashboardSummary = DashboardSummaryDto()
    var notificationPage = NotificationPageDto()
    var unreadCount = 0
    var listDetailPayload = ReadingListDetailDto(readingList(), true, ReadingListOwnerDto("ada", "Ada"))
    var nextListCursor: String? = null
    var nextNotificationCursor: String? = null
    var failMarkAllRead = false
    var markAllReadCalls = 0
    var failLists = false
    var failCreateList = false
    var failListItems = false
    var failDashboard = false
    var failNotifications = false
    var listCursors = mutableListOf<String?>()
    var notificationCursors = mutableListOf<String?>()

    override suspend fun myLists(origin: String, accessToken: String): ReadingListsDto {
        if (failLists) error("lists request failed")
        return ReadingListsDto(lists)
    }

    override suspend fun createList(origin: String, request: CreateListRequestDto, accessToken: String): ReadingListEnvelopeDto {
        if (failCreateList) error("create list failed")
        val list = createdList ?: readingList("created", request.title, request.description, request.visibility)
        return ReadingListEnvelopeDto(list)
    }

    override suspend fun listDetail(origin: String, listId: String, accessToken: String) = listDetailPayload

    override suspend fun listItems(origin: String, listId: String, cursor: String?, accessToken: String): TimelinePageDto {
        if (failListItems) error("list items failed")
        listCursors += cursor
        return TimelinePageDto(listPosts, nextListCursor)
    }

    override suspend fun dashboard(origin: String, days: Int, accessToken: String): DashboardSummaryDto {
        if (failDashboard) error("dashboard failed")
        return dashboardSummary
    }

    override suspend fun notifications(origin: String, cursor: String?, accessToken: String): NotificationPageDto {
        if (failNotifications) error("notifications failed")
        notificationCursors += cursor
        return notificationPage.copy(nextCursor = nextNotificationCursor ?: notificationPage.nextCursor)
    }

    override suspend fun unreadNotificationCount(origin: String, accessToken: String) = UnreadNotificationCountDto(unreadCount)

    override suspend fun markAllNotificationsRead(origin: String, accessToken: String) {
        markAllReadCalls += 1
        if (failMarkAllRead) error("mark-all-read failed")
    }

    override suspend fun markNotificationRead(origin: String, notificationId: String, accessToken: String) = Unit
}

internal fun readingList(
    id: String = "list-1",
    title: String = "Reading list",
    description: String = "",
    visibility: String = "public",
    isReadLater: Boolean = false,
) = ReadingListDto(id, title, description, visibility, isReadLater, 1, "2026-01-01T00:00:00Z")

internal fun mobileWebInstance() =
    InstanceConfiguration(
        origin = "https://omicron.blog",
        name = "Omicron",
        domain = "omicron.blog",
        federationEnabled = true,
        setupComplete = true,
        emailEnabled = true,
        emailVerificationRequired = true,
    )

internal fun fakeMobileWebRepository(api: FakeMobileWebApi) =
    org.omicron.mobile.data.repository.MobileWebRepository(
        api = api,
        savedInstance = { mobileWebInstance() },
        accessToken = { "signed-token" },
    )

internal fun fakePostDto(
    id: String,
    title: String = "Title $id",
) =
    PostDto(
        id = id,
        title = title,
        contentHtml = "<p>Summary</p>",
        createdAt = "2026-01-01T00:00:00Z",
        author = PostAuthorDto("user-1", "ada", "Ada"),
    )
