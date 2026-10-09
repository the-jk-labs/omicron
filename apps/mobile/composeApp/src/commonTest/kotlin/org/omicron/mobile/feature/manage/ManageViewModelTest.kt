package org.omicron.mobile.feature.manage

import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.io.IOException
import org.omicron.mobile.data.api.AuthoringApi
import org.omicron.mobile.data.api.BarePostDto
import org.omicron.mobile.data.api.CreatePostRequest
import org.omicron.mobile.data.api.OwnCountsDto
import org.omicron.mobile.data.api.PostDto
import org.omicron.mobile.data.api.TimelinePageDto
import org.omicron.mobile.data.api.TimelineScope
import org.omicron.mobile.data.api.UpdatePostRequest
import org.omicron.mobile.data.api.UploadResponseDto
import org.omicron.mobile.data.repository.AuthoringRepository
import org.omicron.mobile.domain.model.InstanceConfiguration
import org.omicron.mobile.domain.model.OwnPostStatus
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ManageViewModelTest {
    @Test
    fun initialLoadShowsCountsAndDraftLane() = runTest {
        val viewModel = manageViewModel()
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertIs<ManagePhase.Content>(state.phase)
        assertEquals(2, state.counts.draft)
        assertEquals(1, state.counts.scheduled)
        assertEquals(listOf("draft-1", "draft-2"), state.lanes.getValue(OwnPostStatus.Draft).items.map { it.id })
        assertNull(state.error)
    }

    @Test
    fun tabsLoadLazilyAndKeepTheirLanes() = runTest {
        val api = ManageAuthoringApi()
        val viewModel = manageViewModel(api)
        testScheduler.advanceUntilIdle()

        viewModel.selectTab(OwnPostStatus.Scheduled)
        testScheduler.advanceUntilIdle()
        assertEquals(listOf("sched-1"), viewModel.uiState.value.lanes.getValue(OwnPostStatus.Scheduled).items.map { it.id })

        viewModel.selectTab(OwnPostStatus.Draft)
        testScheduler.advanceUntilIdle()
        viewModel.selectTab(OwnPostStatus.Scheduled)
        testScheduler.advanceUntilIdle()

        assertEquals(1, api.ownCalls.count { it == "scheduled" })
    }

    @Test
    fun loadMoreAppendsWithCursor() = runTest {
        val api = ManageAuthoringApi()
        val viewModel = manageViewModel(api)
        testScheduler.advanceUntilIdle()

        viewModel.selectTab(OwnPostStatus.Published)
        testScheduler.advanceUntilIdle()
        viewModel.loadMore()
        testScheduler.advanceUntilIdle()

        val lane = viewModel.uiState.value.lanes.getValue(OwnPostStatus.Published)
        assertEquals(listOf("pub-1", "pub-2"), lane.items.map { it.id })
        assertNull(lane.cursor)
        assertEquals("cursor-1", api.cursorRequests.last())
    }

    @Test
    fun publishNowMovesDraftOut() = runTest {
        val api = ManageAuthoringApi()
        val viewModel = manageViewModel(api)
        testScheduler.advanceUntilIdle()

        viewModel.publishNow("draft-1")
        testScheduler.advanceUntilIdle()

        assertEquals("published", api.lastUpdate?.status)
        assertEquals(OwnPostStatus.Draft, viewModel.uiState.value.tab)
        assertTrue(viewModel.uiState.value.lanes.getValue(OwnPostStatus.Draft).loaded)
    }

    @Test
    fun rescheduleSendsStatusAndPublishAt() = runTest {
        val api = ManageAuthoringApi()
        val viewModel = manageViewModel(api)
        testScheduler.advanceUntilIdle()

        viewModel.selectTab(OwnPostStatus.Draft)
        viewModel.reschedule("draft-1", "2026-12-01T09:00:00Z")
        testScheduler.advanceUntilIdle()

        assertEquals("scheduled", api.lastUpdate?.status)
        assertEquals("2026-12-01T09:00:00Z", api.lastUpdate?.publishAt)
        assertNull(viewModel.uiState.value.rescheduling)
    }

    @Test
    fun unscheduleSendsDraft() = runTest {
        val api = ManageAuthoringApi()
        val viewModel = manageViewModel(api)
        testScheduler.advanceUntilIdle()

        viewModel.selectTab(OwnPostStatus.Scheduled)
        testScheduler.advanceUntilIdle()
        viewModel.unschedule("sched-1")
        testScheduler.advanceUntilIdle()

        assertEquals("draft", api.lastUpdate?.status)
        assertNull(api.lastUpdate?.publishAt)
    }

    @Test
    fun deleteRequiresConfirmation() = runTest {
        val api = ManageAuthoringApi()
        val viewModel = manageViewModel(api)
        testScheduler.advanceUntilIdle()

        viewModel.requestAction(ManagePendingAction.Delete("draft-1", OwnPostStatus.Draft))
        assertEquals(ManagePendingAction.Delete("draft-1", OwnPostStatus.Draft), viewModel.uiState.value.pendingAction)
        assertEquals(0, api.deleteCalls)

        viewModel.confirmPendingAction()
        testScheduler.advanceUntilIdle()

        assertEquals(listOf("draft-1"), api.deletedIds)
        assertNull(viewModel.uiState.value.pendingAction)
    }

    @Test
    fun unpublishRequiresConfirmation() = runTest {
        val api = ManageAuthoringApi()
        val viewModel = manageViewModel(api)
        testScheduler.advanceUntilIdle()

        viewModel.selectTab(OwnPostStatus.Published)
        testScheduler.advanceUntilIdle()
        viewModel.requestAction(ManagePendingAction.Unpublish("pub-1"))
        viewModel.confirmPendingAction()
        testScheduler.advanceUntilIdle()

        assertEquals("draft", api.lastUpdate?.status)
        assertEquals(0, api.deleteCalls)
    }

    @Test
    fun offlineLoadShowsErrorAndRetryRecovers() = runTest {
        val api = ManageAuthoringApi(failure = IOException("unresolved"))
        val viewModel = manageViewModel(api)
        testScheduler.advanceUntilIdle()

        assertIs<ManagePhase.Error>(viewModel.uiState.value.phase)
        assertEquals(ManageError.Offline, (viewModel.uiState.value.phase as ManagePhase.Error).error)

        api.failure = null
        viewModel.refresh()
        testScheduler.advanceUntilIdle()

        assertIs<ManagePhase.Content>(viewModel.uiState.value.phase)
    }

    @Test
    fun sessionExpiryUpdatesTheScreenState() = runTest {
        val api = ManageAuthoringApi()
        val expired = MutableStateFlow(false)
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel =
            ManageViewModel(
                AuthoringRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" }),
                TestScope(dispatcher),
                expired,
            )
        testScheduler.advanceUntilIdle()

        expired.value = true
        testScheduler.advanceUntilIdle()

        assertTrue(viewModel.uiState.value.sessionExpired)
    }

    private fun TestScope.manageViewModel(api: AuthoringApi = ManageAuthoringApi()): ManageViewModel {
        val dispatcher = StandardTestDispatcher(testScheduler)
        return ManageViewModel(
            AuthoringRepository(api, savedInstance = { instance() }, accessToken = { "signed-token" }),
            TestScope(dispatcher),
        )
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

    private class ManageAuthoringApi(
        var failure: Throwable? = null,
    ) : AuthoringApi {
        val ownCalls = mutableListOf<String>()
        val cursorRequests = mutableListOf<String?>()
        var lastUpdate: UpdatePostRequest? = null
        var lastUpdateId: String? = null
        var deleteCalls = 0
        val deletedIds = mutableListOf<String>()

        private fun page(status: String, cursor: String?): TimelinePageDto {
            failure?.let { throw it }
            ownCalls += status
            cursorRequests += cursor
            return when {
                status == "draft" ->
                    TimelinePageDto(
                        items =
                            listOf(
                                ownDto("draft-1", "First draft", "draft"),
                                ownDto("draft-2", "Second draft", "draft"),
                            ),
                    )
                status == "scheduled" ->
                    TimelinePageDto(
                        items = listOf(ownDto("sched-1", "Queued post", "scheduled", "2026-12-01T09:00:00Z")),
                    )
                cursor == null ->
                    TimelinePageDto(items = listOf(ownDto("pub-1", "Live post", "published")), nextCursor = "cursor-1")
                else ->
                    TimelinePageDto(items = listOf(ownDto("pub-2", "Older post", "published")))
            }
        }

        private fun ownDto(id: String, title: String, status: String, publishAt: String? = null) =
            PostDto(
                id = id,
                title = title,
                contentHtml = "<p>$title</p>",
                status = status,
                publishAt = publishAt,
                createdAt = "2026-01-01T00:00:00Z",
                author =
                    org.omicron.mobile.data.api.PostAuthorDto(
                        "user-1",
                        "alice",
                        "Alice",
                    ),
                tags = emptyList(),
            )

        override suspend fun createPost(origin: String, request: CreatePostRequest, accessToken: String): BarePostDto =
            throw UnsupportedOperationException()

        override suspend fun updatePost(origin: String, id: String, request: UpdatePostRequest, accessToken: String): BarePostDto {
            failure?.let { throw it }
            lastUpdateId = id
            lastUpdate = request
            return BarePostDto(id = id, title = request.title, status = request.status, createdAt = "2026-01-01T00:00:00Z")
        }

        override suspend fun deletePost(origin: String, id: String, notify: Boolean, accessToken: String) {
            failure?.let { throw it }
            deleteCalls += 1
            deletedIds += id
        }

        override suspend fun drafts(origin: String, cursor: String?, accessToken: String): TimelinePageDto =
            TimelinePageDto(emptyList(), null)

        override suspend fun ownPosts(origin: String, status: String, cursor: String?, accessToken: String): TimelinePageDto =
            page(status, cursor)

        override suspend fun ownCounts(origin: String, accessToken: String): OwnCountsDto {
            failure?.let { throw it }
            return OwnCountsDto(draft = 2, scheduled = 1, published = 2)
        }

        override suspend fun uploadImage(origin: String, bytes: ByteArray, contentType: String, accessToken: String): UploadResponseDto =
            throw UnsupportedOperationException()
    }
}
