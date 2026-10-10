package org.omicron.mobile.feature.notifications

import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.omicron.mobile.data.api.NotificationDto
import org.omicron.mobile.data.api.NotificationPageDto
import org.omicron.mobile.data.api.PostAuthorDto
import org.omicron.mobile.feature.navigation.FakeMobileWebApi
import org.omicron.mobile.feature.navigation.fakeMobileWebRepository
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NotificationsViewModelTest {
    @Test
    fun viewingUnreadNotificationsMarksServerStateAndKeepsUnreadRowHighlight() = runTest {
        val api =
            FakeMobileWebApi().apply {
                unreadCount = 1
                notificationPage =
                    NotificationPageDto(
                        items =
                            listOf(
                                NotificationDto(
                                    id = "notification-1",
                                    type = "like",
                                    actor = PostAuthorDto("actor-1", "alice", "Alice"),
                                    postId = "post-1",
                                    postTitle = "A post",
                                    read = false,
                                    createdAt = "2026-01-01T00:00:00Z",
                                ),
                            ),
                    )
            }
        val viewModel = notificationsViewModel(api)
        viewModel.refreshUnreadCount()
        viewModel.loadIfNeeded()
        testScheduler.advanceUntilIdle()

        assertEquals(NotificationsPhase.Content, viewModel.uiState.value.phase)
        assertFalse(viewModel.uiState.value.items.single().read)
        assertEquals(0, viewModel.uiState.value.unreadCount)
        assertEquals(1, api.markAllReadCalls)
        viewModel.close()
    }

    @Test
    fun failedMarkAllReadCanBeRetriedAndPageCursorRemainsOpaque() = runTest {
        val api =
            FakeMobileWebApi().apply {
                failMarkAllRead = true
                notificationPage = NotificationPageDto(items = listOf(NotificationDto("notification-1", "follow", null, null, null, null, false, "2026-01-01T00:00:00Z")), nextCursor = "opaque-next")
            }
        val viewModel = notificationsViewModel(api)
        viewModel.loadIfNeeded()
        testScheduler.advanceUntilIdle()
        assertTrue(viewModel.uiState.value.markReadError)

        api.failMarkAllRead = false
        viewModel.retryMarkAllRead()
        viewModel.loadMore()
        testScheduler.advanceUntilIdle()

        assertFalse(viewModel.uiState.value.markReadError)
        assertEquals(listOf(null, "opaque-next"), api.notificationCursors)
        viewModel.close()
    }

    private fun TestScope.notificationsViewModel(api: FakeMobileWebApi) =
        NotificationsViewModel(
            repository = fakeMobileWebRepository(api),
            scope = TestScope(StandardTestDispatcher(testScheduler)),
        )
}
