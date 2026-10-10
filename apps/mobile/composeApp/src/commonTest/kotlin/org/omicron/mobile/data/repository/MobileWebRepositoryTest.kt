package org.omicron.mobile.data.repository

import kotlinx.coroutines.test.runTest
import org.omicron.mobile.data.api.CreateListRequestDto
import org.omicron.mobile.data.api.DashboardSummaryDto
import org.omicron.mobile.data.api.DashboardTotalsDto
import org.omicron.mobile.data.api.DayTotalsDto
import org.omicron.mobile.data.api.MobileWebApi
import org.omicron.mobile.data.api.NotificationDto
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
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class MobileWebRepositoryTest {
    @Test
    fun mapsListsAndCreatesWithTrimmedValues() = runTest {
        val api = RecordingMobileWebApi()
        val repository = MobileWebRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" })

        val lists = repository.myLists()
        val created = repository.createList(" New list ", "  Description  ", "private")

        assertEquals("Read later", lists.first().title)
        assertEquals(true, lists.first().isReadLater)
        assertEquals("New list", api.createRequest?.title)
        assertEquals("Description", api.createRequest?.description)
        assertEquals("private", created.visibility)
        assertEquals(listOf("signed-token", "signed-token"), api.tokens)
    }

    @Test
    fun preservesListCursorAndResolvesPostAndNotificationMedia() = runTest {
        val api = RecordingMobileWebApi(nextCursor = "opaque-next")
        val repository = MobileWebRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" })

        val detail = repository.listDetail("list-1")
        val items = repository.listItems("list-1", "opaque/+cursor=")
        val notifications = repository.notifications("notification-cursor")

        assertEquals("owner", detail.owner.username)
        assertEquals(listOf<String?>("opaque/+cursor="), api.listCursors)
        assertEquals("opaque-next", items.nextCursor)
        assertEquals("https://omicron.blog/uploads/banner.jpg", items.items.single().bannerUrl)
        assertEquals(listOf<String?>("notification-cursor"), api.notificationCursors)
        assertEquals("https://omicron.blog/uploads/avatar.jpg", notifications.items.single().actor?.avatarUrl)
    }

    @Test
    fun mapsDashboardTotalsAndMissingInstanceIsRejectedBeforeNetwork() = runTest {
        val api = RecordingMobileWebApi()
        val repository = MobileWebRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" })

        val dashboard = repository.dashboard(days = 500)
        assertEquals(12, dashboard.totals.views)
        assertEquals(1, dashboard.series.size)
        assertEquals(365, api.dashboardDays)

        val missing = MobileWebRepository(api, savedInstance = { null }, accessToken = { "signed-token" })
        assertIs<MissingInstanceException>(runCatching { missing.myLists() }.exceptionOrNull())
    }

    private fun instance() =
        InstanceConfiguration(
            origin = "https://omicron.blog",
            name = "Omicron",
            domain = "omicron.blog",
            federationEnabled = true,
            setupComplete = true,
            emailEnabled = true,
            emailVerificationRequired = true,
        )

    private class RecordingMobileWebApi(
        private val nextCursor: String? = null,
    ) : MobileWebApi {
        val tokens = mutableListOf<String>()
        val listCursors = mutableListOf<String?>()
        val notificationCursors = mutableListOf<String?>()
        var createRequest: CreateListRequestDto? = null
        var dashboardDays: Int? = null

        override suspend fun myLists(origin: String, accessToken: String): ReadingListsDto {
            tokens += accessToken
            return ReadingListsDto(listOf(list(isReadLater = true)))
        }

        override suspend fun createList(origin: String, request: CreateListRequestDto, accessToken: String): ReadingListEnvelopeDto {
            tokens += accessToken
            createRequest = request
            return ReadingListEnvelopeDto(list(id = "new-list", title = request.title, visibility = request.visibility))
        }

        override suspend fun listDetail(origin: String, listId: String, accessToken: String): ReadingListDetailDto {
            tokens += accessToken
            return ReadingListDetailDto(list(), true, ReadingListOwnerDto("owner", "Owner"))
        }

        override suspend fun listItems(origin: String, listId: String, cursor: String?, accessToken: String): TimelinePageDto {
            tokens += accessToken
            listCursors += cursor
            return TimelinePageDto(
                items = listOf(PostDto("post-1", title = "Post", bannerUrl = "/uploads/banner.jpg", createdAt = "2026-01-01T00:00:00Z", author = PostAuthorDto("user-1", "alice", "Alice"))),
                nextCursor = nextCursor,
            )
        }

        override suspend fun dashboard(origin: String, days: Int, accessToken: String): DashboardSummaryDto {
            tokens += accessToken
            dashboardDays = days
            return DashboardSummaryDto(
                onInstanceViews = true,
                totals = DashboardTotalsDto(12, 4, 2, 9),
                series = listOf(DayTotalsDto("2026-01-01", 12)),
                posts = listOf(PostStatDto("post-1", "Post", "post", "2026-01-01T00:00:00Z", 12, 4, 2)),
            )
        }

        override suspend fun notifications(origin: String, cursor: String?, accessToken: String): NotificationPageDto {
            tokens += accessToken
            notificationCursors += cursor
            return NotificationPageDto(
                items = listOf(NotificationDto("notification-1", "follow", PostAuthorDto("actor-1", "alice", "Alice", "/uploads/avatar.jpg"), null, null, null, false, "2026-01-01T00:00:00Z")),
                nextCursor = nextCursor,
            )
        }

        override suspend fun unreadNotificationCount(origin: String, accessToken: String) = UnreadNotificationCountDto(1)

        override suspend fun markAllNotificationsRead(origin: String, accessToken: String) = Unit

        override suspend fun markNotificationRead(origin: String, notificationId: String, accessToken: String) = Unit

        private fun list(
            id: String = "read-later",
            title: String = "Read later",
            visibility: String = "private",
            isReadLater: Boolean = false,
        ) = ReadingListDto(id = id, title = title, description = "", visibility = visibility, isReadLater = isReadLater, itemCount = 2, createdAt = "2026-01-01T00:00:00Z")
    }
}
