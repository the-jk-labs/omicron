package org.omicron.mobile.feature.manage

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.io.IOException
import org.omicron.mobile.data.repository.AuthoringRepository
import org.omicron.mobile.data.repository.MissingInstanceException
import org.omicron.mobile.data.repository.UnauthorizedException
import org.omicron.mobile.domain.model.OwnCounts
import org.omicron.mobile.domain.model.OwnPost
import org.omicron.mobile.domain.model.OwnPostStatus
import org.omicron.mobile.domain.model.UpdatePostInput

class ManageViewModel(
    private val authoringRepository: AuthoringRepository,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    private val sessionExpired: StateFlow<Boolean>? = null,
) {
    private val mutableUiState = MutableStateFlow(ManageUiState())
    val uiState: StateFlow<ManageUiState> = mutableUiState.asStateFlow()

    private var loadJob: Job? = null

    init {
        mutableUiState.update { it.copy(sessionExpired = sessionExpired?.value ?: false) }
        sessionExpired?.let { expired ->
            scope.launch { expired.collect { value -> mutableUiState.update { it.copy(sessionExpired = value) } } }
        }
        refresh()
    }

    fun selectTab(tab: OwnPostStatus) {
        if (tab == mutableUiState.value.tab) return
        mutableUiState.update { it.copy(tab = tab, error = null) }
        ensureLane(tab)
    }

    fun loadMore() {
        val state = mutableUiState.value
        val lane = state.lanes.getValue(state.tab)
        val cursor = lane.cursor ?: return
        if (!lane.loaded || lane.loading || state.loadingMore || state.actionBusy) return
        scope.launch {
            mutableUiState.update { it.copy(loadingMore = true, loadMoreError = null) }
            runCatching { authoringRepository.ownPosts(state.tab, cursor) }
                .onSuccess { page ->
                    mutableUiState.update {
                        it.copy(
                            lanes = it.lanes + (state.tab to lane.copy(items = lane.items + page.items, cursor = page.nextCursor)),
                            loadingMore = false,
                        )
                    }
                }.onFailure { error ->
                    mutableUiState.update { it.copy(loadingMore = false, loadMoreError = error.toManageError()) }
                }
        }
    }

    fun refresh() {
        loadJob?.cancel()
        val requestedTab = mutableUiState.value.tab
        loadJob =
            scope.launch {
                mutableUiState.update { it.copy(phase = ManagePhase.Loading, error = null) }
                runCatching {
                    val counts = authoringRepository.ownCounts()
                    val page = authoringRepository.ownPosts(requestedTab, null)
                    counts to page
                }.onSuccess { (counts, page) ->
                    mutableUiState.update {
                        it.copy(
                            counts = counts,
                            lanes = it.lanes + (requestedTab to ManageLane(items = page.items, cursor = page.nextCursor, loaded = true)),
                            phase = ManagePhase.Content,
                        )
                    }
                }.onFailure { error ->
                    mutableUiState.update { it.copy(phase = ManagePhase.Error(error.toManageError())) }
                }
            }
    }

    fun retryLoadMore() {
        mutableUiState.update { it.copy(loadMoreError = null) }
        loadMore()
    }

    fun publishNow(id: String) {
        mutate(id, UpdatePostInput(status = OwnPostStatus.Published))
    }

    fun unschedule(id: String) {
        mutate(id, UpdatePostInput(status = OwnPostStatus.Draft))
    }

    fun reschedule(id: String, at: String) {
        mutableUiState.update { it.copy(rescheduling = null) }
        mutate(id, UpdatePostInput(status = OwnPostStatus.Scheduled, publishAt = at))
    }

    fun openReschedule(post: OwnPost) {
        mutableUiState.update { it.copy(rescheduling = post, pendingAction = null) }
    }

    fun dismissReschedule() {
        mutableUiState.update { it.copy(rescheduling = null) }
    }

    fun requestAction(action: ManagePendingAction) {
        mutableUiState.update { it.copy(pendingAction = action, rescheduling = null) }
    }

    fun cancelPendingAction() {
        mutableUiState.update { it.copy(pendingAction = null) }
    }

    fun confirmPendingAction() {
        val pending = mutableUiState.value.pendingAction ?: return
        when (pending) {
            is ManagePendingAction.Delete -> {
                mutableUiState.update { it.copy(pendingAction = null) }
                remove(pending.postId)
            }
            is ManagePendingAction.Unpublish -> {
                mutableUiState.update { it.copy(pendingAction = null) }
                mutate(pending.postId, UpdatePostInput(status = OwnPostStatus.Draft))
            }
        }
    }

    fun close() {
        loadJob?.cancel()
        scope.cancel()
    }

    private fun mutate(id: String, input: UpdatePostInput) {
        if (mutableUiState.value.actionBusy) return
        scope.launch {
            mutableUiState.update { it.copy(actionBusyId = id, error = null) }
            runCatching { authoringRepository.updatePost(id, input) }
                .onSuccess { reloadAfterMutation() }
                .onFailure { error ->
                    mutableUiState.update { it.copy(actionBusyId = null, error = error.toManageError()) }
                }
        }
    }

    private fun remove(id: String) {
        if (mutableUiState.value.actionBusy) return
        scope.launch {
            mutableUiState.update { it.copy(actionBusyId = id, error = null) }
            runCatching { authoringRepository.deletePost(id) }
                .onSuccess { reloadAfterMutation() }
                .onFailure { error ->
                    mutableUiState.update { it.copy(actionBusyId = null, error = error.toManageError()) }
                }
        }
    }

    private suspend fun reloadAfterMutation() {
        val tab = mutableUiState.value.tab
        runCatching {
            val counts = authoringRepository.ownCounts()
            val page = authoringRepository.ownPosts(tab, null)
            counts to page
        }.onSuccess { (counts, page) ->
            mutableUiState.update {
                it.copy(
                    counts = counts,
                    lanes = blankLanes() + (tab to ManageLane(items = page.items, cursor = page.nextCursor, loaded = true)),
                    actionBusyId = null,
                )
            }
        }.onFailure { error ->
            mutableUiState.update { it.copy(actionBusyId = null, error = error.toManageError()) }
        }
    }

    private fun ensureLane(tab: OwnPostStatus) {
        val lane = mutableUiState.value.lanes.getValue(tab)
        if (lane.loaded || lane.loading) return
        scope.launch {
            mutableUiState.update { it.copy(lanes = it.lanes + (tab to lane.copy(loading = true))) }
            runCatching { authoringRepository.ownPosts(tab, null) }
                .onSuccess { page ->
                    mutableUiState.update {
                        it.copy(
                            lanes = it.lanes + (tab to ManageLane(items = page.items, cursor = page.nextCursor, loaded = true)),
                        )
                    }
                }.onFailure { error ->
                    mutableUiState.update {
                        it.copy(
                            lanes = it.lanes + (tab to lane.copy(loading = false)),
                            error = error.toManageError(),
                        )
                    }
                }
        }
    }

    private fun blankLanes(): Map<OwnPostStatus, ManageLane> =
        mapOf(
            OwnPostStatus.Draft to ManageLane(),
            OwnPostStatus.Scheduled to ManageLane(),
            OwnPostStatus.Published to ManageLane(),
        )
}

data class ManageUiState(
    val tab: OwnPostStatus = OwnPostStatus.Draft,
    val counts: OwnCounts = OwnCounts(draft = 0, scheduled = 0, published = 0),
    val lanes: Map<OwnPostStatus, ManageLane> = mapOf(
        OwnPostStatus.Draft to ManageLane(),
        OwnPostStatus.Scheduled to ManageLane(),
        OwnPostStatus.Published to ManageLane(),
    ),
    val phase: ManagePhase = ManagePhase.Loading,
    val error: ManageError? = null,
    val loadingMore: Boolean = false,
    val loadMoreError: ManageError? = null,
    val actionBusyId: String? = null,
    val pendingAction: ManagePendingAction? = null,
    val rescheduling: OwnPost? = null,
    val sessionExpired: Boolean = false,
) {
    val actionBusy: Boolean get() = actionBusyId != null
}

data class ManageLane(
    val items: List<OwnPost> = emptyList(),
    val cursor: String? = null,
    val loaded: Boolean = false,
    val loading: Boolean = false,
)

sealed interface ManagePhase {
    data object Loading : ManagePhase

    data object Content : ManagePhase

    data class Error(val error: ManageError) : ManagePhase
}

sealed interface ManagePendingAction {
    val postId: String

    data class Delete(override val postId: String, val status: OwnPostStatus) : ManagePendingAction

    data class Unpublish(override val postId: String) : ManagePendingAction
}

enum class ManageError {
    Offline,
    Server,
    MissingInstance,
    Unauthorized,
}

private fun Throwable.toManageError(): ManageError =
    when (this) {
        is MissingInstanceException -> ManageError.MissingInstance
        is UnauthorizedException -> ManageError.Unauthorized
        is IOException -> ManageError.Offline
        else -> ManageError.Server
    }
