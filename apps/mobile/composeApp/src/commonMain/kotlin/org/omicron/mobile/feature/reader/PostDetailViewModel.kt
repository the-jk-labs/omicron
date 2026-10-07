package org.omicron.mobile.feature.reader

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
import org.omicron.mobile.data.repository.MissingInstanceException
import org.omicron.mobile.data.repository.PostsRepository
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.domain.model.PostDetail

class PostDetailViewModel(
    private val repository: PostsRepository,
    private val postId: String,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
) {
    private val mutableUiState = MutableStateFlow(PostDetailUiState())
    val uiState: StateFlow<PostDetailUiState> = mutableUiState.asStateFlow()

    private val mutableOrigin = MutableStateFlow<String?>(null)
    val origin: StateFlow<String?> = mutableOrigin.asStateFlow()

    init {
        load()
    }

    fun refresh() {
        load()
    }

    fun retry() {
        load()
    }

    fun close() {
        scope.cancel()
    }

    private fun load() {
        scope.launch {
            mutableUiState.update { PostDetailUiState(phase = PostDetailPhase.Loading) }
            mutableOrigin.value = repository.origin()
            val post = runCatching { repository.postDetail(postId) }
            val related = runCatching { repository.relatedPosts(postId) }.getOrDefault(emptyList())
            post
                .onSuccess { detail ->
                    mutableUiState.update {
                        PostDetailUiState(post = detail, related = related, phase = PostDetailPhase.Content)
                    }
                }.onFailure { error ->
                    mutableUiState.update { PostDetailUiState(phase = error.toDetailPhase()) }
                }
        }
    }
}

data class PostDetailUiState(
    val post: PostDetail? = null,
    val related: List<Post> = emptyList(),
    val phase: PostDetailPhase = PostDetailPhase.Loading,
)

sealed interface PostDetailPhase {
    data object Loading : PostDetailPhase

    data object Content : PostDetailPhase

    data object NotFound : PostDetailPhase

    data class Error(
        val error: PostDetailError,
    ) : PostDetailPhase
}

enum class PostDetailError {
    Offline,
    Server,
    MissingInstance,
}

private fun Throwable.toDetailPhase(): PostDetailPhase =
    when {
        this is MissingInstanceException -> PostDetailPhase.Error(PostDetailError.MissingInstance)
        this is ClientRequestException && response.status == HttpStatusCode.NotFound -> PostDetailPhase.NotFound
        this is IOException -> PostDetailPhase.Error(PostDetailError.Offline)
        else -> PostDetailPhase.Error(PostDetailError.Server)
    }
