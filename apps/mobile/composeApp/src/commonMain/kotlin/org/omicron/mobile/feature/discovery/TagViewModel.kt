package org.omicron.mobile.feature.discovery

import io.ktor.client.plugins.ClientRequestException
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.io.IOException
import org.omicron.mobile.data.repository.DiscoveryRepository
import org.omicron.mobile.data.repository.MissingInstanceException
import org.omicron.mobile.data.repository.UnauthorizedException
import org.omicron.mobile.domain.model.AuthenticatedSession
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.domain.model.TagDetail

class TagViewModel(
    private val repository: DiscoveryRepository,
    private val slug: String,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    private val session: StateFlow<AuthenticatedSession?>? = null,
) {
    private val mutableUiState = MutableStateFlow(TagUiState(signedIn = session?.value != null))
    val uiState: StateFlow<TagUiState> = mutableUiState.asStateFlow()

    init {
        session?.let { sessions ->
            scope.launch {
                sessions.collect { current ->
                    mutableUiState.update { it.copy(signedIn = current != null) }
                }
            }
        }
        load()
    }

    fun retry() {
        load()
    }

    fun refresh() {
        load()
    }

    fun loadMore() {
        val current = mutableUiState.value
        val cursor = current.nextCursor ?: return
        if (current.phase !is TagPhase.Content || current.isLoadingMore) return
        scope.launch {
            mutableUiState.update { it.copy(isLoadingMore = true, loadMoreError = null) }
            runCatching { repository.tagPosts(slug, cursor) }
                .onSuccess { page ->
                    mutableUiState.update {
                        it.copy(
                            posts = it.posts + page.items,
                            nextCursor = page.nextCursor,
                            isLoadingMore = false,
                        )
                    }
                }.onFailure { error ->
                    mutableUiState.update { it.copy(isLoadingMore = false, loadMoreError = error.toTagError()) }
                }
        }
    }

    fun toggleFollow() {
        val detail = mutableUiState.value.detail ?: return
        if (!mutableUiState.value.signedIn || mutableUiState.value.followBusy) return
        val desired = !detail.isFollowing
        mutableUiState.update {
            it.copy(
                detail = detail.copy(isFollowing = desired, followerCount = detail.followerCount + if (desired) 1 else -1),
                followBusy = true,
                followError = false,
            )
        }
        scope.launch {
            runCatching { repository.setTagFollow(slug, desired) }
                .onSuccess {
                    mutableUiState.update { it.copy(followBusy = false) }
                }.onFailure { error ->
                    if (error is UnauthorizedException) {
                        mutableUiState.update { it.copy(signedIn = false, followBusy = false, followError = true) }
                    }
                    mutableUiState.update {
                        it.copy(
                            detail = detail,
                            followBusy = false,
                            followError = true,
                        )
                    }
                }
        }
    }

    fun close() {
        scope.cancel()
    }

    private fun load() {
        scope.launch {
            mutableUiState.update { it.copy(phase = TagPhase.Loading, isLoadingMore = false, loadMoreError = null) }
            runCatching {
                val detail = repository.tagDetail(slug)
                val page = repository.tagPosts(slug, null)
                detail to page
            }.onSuccess { (detail, page) ->
                mutableUiState.update {
                    it.copy(
                        detail = detail,
                        posts = page.items,
                        nextCursor = page.nextCursor,
                        phase = if (page.items.isEmpty()) TagPhase.Empty else TagPhase.Content,
                    )
                }
            }.onFailure { error ->
                mutableUiState.update {
                    it.copy(
                        phase = TagPhase.Error(error.toTagError()),
                    )
                }
            }
        }
    }
}

data class TagUiState(
    val detail: TagDetail? = null,
    val posts: List<Post> = emptyList(),
    val nextCursor: String? = null,
    val phase: TagPhase = TagPhase.Loading,
    val isLoadingMore: Boolean = false,
    val loadMoreError: TagError? = null,
    val signedIn: Boolean = false,
    val followBusy: Boolean = false,
    val followError: Boolean = false,
)

sealed interface TagPhase {
    data object Loading : TagPhase

    data object Content : TagPhase

    data object Empty : TagPhase

    data class Error(val error: TagError) : TagPhase
}

enum class TagError {
    Offline,
    Server,
    MissingInstance,
    NotFound,
}

private fun Throwable.toTagError(): TagError =
    when {
        this is MissingInstanceException -> TagError.MissingInstance
        this is IOException -> TagError.Offline
        this is ClientRequestException && response.status == HttpStatusCode.NotFound -> TagError.NotFound
        else -> TagError.Server
    }
