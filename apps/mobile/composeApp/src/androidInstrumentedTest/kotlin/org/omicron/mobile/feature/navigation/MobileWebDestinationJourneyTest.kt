package org.omicron.mobile.feature.navigation

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.data.api.CreateListRequestDto
import org.omicron.mobile.data.api.DashboardSummaryDto
import org.omicron.mobile.data.api.DashboardTotalsDto
import org.omicron.mobile.data.api.MobileWebApi
import org.omicron.mobile.data.api.NotificationDto
import org.omicron.mobile.data.api.NotificationPageDto
import org.omicron.mobile.data.api.PostAuthorDto
import org.omicron.mobile.data.api.PostStatDto
import org.omicron.mobile.data.api.ReadingListDetailDto
import org.omicron.mobile.data.api.ReadingListDto
import org.omicron.mobile.data.api.ReadingListEnvelopeDto
import org.omicron.mobile.data.api.ReadingListOwnerDto
import org.omicron.mobile.data.api.ReadingListsDto
import org.omicron.mobile.data.api.TimelinePageDto
import org.omicron.mobile.data.api.UnreadNotificationCountDto
import org.omicron.mobile.data.repository.MobileWebRepository
import org.omicron.mobile.domain.model.InstanceConfiguration
import org.omicron.mobile.feature.dashboard.DashboardRoute
import org.omicron.mobile.feature.dashboard.DashboardViewModel
import org.omicron.mobile.feature.lists.ListsRoute
import org.omicron.mobile.feature.lists.ListsViewModel
import org.omicron.mobile.feature.notifications.NotificationsRoute
import org.omicron.mobile.feature.notifications.NotificationsViewModel

@RunWith(AndroidJUnit4::class)
class MobileWebDestinationJourneyTest {
    @get:Rule
    val composeTestRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun listsLoadsReadLaterAndOpensChosenList() {
        val api = JourneyMobileWebApi()
        val viewModel = ListsViewModel(repository(api))
        var openedList: String? = null
        composeTestRule.setContent {
            OmicronTheme {
                ListsRoute(viewModel = viewModel, onOpenList = { openedList = it })
            }
        }

        composeTestRule.waitForText("Read later")
        composeTestRule.waitForText("Travel writing")
        composeTestRule.onNodeWithText("Travel writing").performClick()

        assertEquals("travel", openedList)
        viewModel.close()
    }

    @Test
    fun dashboardRendersWriterMetricsAndPosts() {
        val api = JourneyMobileWebApi()
        val viewModel = DashboardViewModel(repository(api))
        composeTestRule.setContent {
            OmicronTheme {
                DashboardRoute(viewModel = viewModel, onOpenPost = {})
            }
        }

        composeTestRule.waitForText("Dashboard")
        composeTestRule.waitForText("Reach breakdown")
        composeTestRule.waitForText("A useful article")

        viewModel.close()
    }

    @Test
    fun notificationsCanRetryAfterServerReadFailure() {
        val api = JourneyMobileWebApi(failFirstMarkRead = true)
        val viewModel = NotificationsViewModel(repository(api))
        composeTestRule.setContent {
            OmicronTheme {
                NotificationsRoute(viewModel = viewModel, onOpenPost = {}, onOpenProfile = {})
            }
        }

        composeTestRule.waitForText("Could not mark notifications as read.")
        composeTestRule.onNodeWithText("Try again").performClick()
        composeTestRule.waitUntil(5_000) { api.markReadCalls.get() == 2 }
        assertTrue(composeTestRule.onAllNodesWithText("Could not mark notifications as read.").fetchSemanticsNodes().isEmpty())

        viewModel.close()
    }

    private fun repository(api: MobileWebApi) =
        MobileWebRepository(
            api = api,
            savedInstance = { instance() },
            accessToken = { "signed-token" },
        )

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

    private fun ComposeTestRule.waitForText(text: String) {
        waitUntil(5_000) { onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
        onNodeWithText(text).assertIsDisplayed()
    }

    private class JourneyMobileWebApi(
        private val failFirstMarkRead: Boolean = false,
    ) : MobileWebApi {
        val markReadCalls = AtomicInteger()

        override suspend fun myLists(origin: String, accessToken: String) =
            ReadingListsDto(
                listOf(
                    ReadingListDto("read-later", "Read later", "", "private", true, 1, "2026-01-01T00:00:00Z"),
                    ReadingListDto("travel", "Travel writing", "Essays to revisit", "public", false, 2, "2026-01-01T00:00:00Z"),
                ),
            )

        override suspend fun createList(origin: String, request: CreateListRequestDto, accessToken: String) =
            ReadingListEnvelopeDto(ReadingListDto("new", request.title, request.description, request.visibility, false, 0, "2026-01-01T00:00:00Z"))

        override suspend fun listDetail(origin: String, listId: String, accessToken: String) =
            ReadingListDetailDto(ReadingListDto(listId, "Travel writing", "", "public", false, 2, "2026-01-01T00:00:00Z"), true, ReadingListOwnerDto("ada", "Ada"))

        override suspend fun listItems(origin: String, listId: String, cursor: String?, accessToken: String) = TimelinePageDto()

        override suspend fun dashboard(origin: String, days: Int, accessToken: String) =
            DashboardSummaryDto(
                onInstanceViews = true,
                totals = DashboardTotalsDto(42, 7, 3, 12),
                posts = listOf(PostStatDto("post-1", "A useful article", "a-useful-article", "2026-01-01T00:00:00Z", 42, 7, 3)),
            )

        override suspend fun notifications(origin: String, cursor: String?, accessToken: String) =
            NotificationPageDto(
                items =
                    listOf(
                        NotificationDto(
                            "notification-1",
                            "like",
                            PostAuthorDto("actor-1", "alice", "Alice"),
                            "post-1",
                            "A useful article",
                            null,
                            false,
                            "2026-01-01T00:00:00Z",
                        ),
                    ),
            )

        override suspend fun unreadNotificationCount(origin: String, accessToken: String) = UnreadNotificationCountDto(1)

        override suspend fun markAllNotificationsRead(origin: String, accessToken: String) {
            if (failFirstMarkRead && markReadCalls.incrementAndGet() == 1) error("read request failed")
            if (!failFirstMarkRead) markReadCalls.incrementAndGet()
        }

        override suspend fun markNotificationRead(origin: String, notificationId: String, accessToken: String) = Unit
    }
}
