package org.omicron.mobile.feature.reader

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.random.Random
import org.omicron.mobile.data.repository.SocialRepository
import org.omicron.mobile.domain.model.AuthenticatedSession
import org.omicron.mobile.domain.model.Comment
import org.omicron.mobile.domain.model.PostAuthor
import org.omicron.mobile.domain.model.PostDetail

class PostSocialViewModel(
    private val repository: SocialRepository,
    private val postId: String,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    private val session: StateFlow<AuthenticatedSession?>? = null,
    private val sessionExpired: StateFlow<Boolean>? = null,
) {
    private val mutableUiState = MutableStateFlow(
        PostSocialUiState(
            signedIn = session?.value != null,
            currentUser = session?.value?.user,
            sessionExpired = sessionExpired?.value ?: false,
        ),
    )
    val uiState: StateFlow<PostSocialUiState> = mutableUiState.asStateFlow()
    private var boundPost = false

    init {
        session?.let { sessions ->
            scope.launch {
                var wasSignedIn = sessions.value != null
                sessions.collect { current ->
                    val signedIn = current != null
                    mutableUiState.update { it.copy(signedIn = signedIn, currentUser = current?.user) }
                    if (signedIn != wasSignedIn) {
                        wasSignedIn = signedIn
                        if (signedIn && boundPost) loadReadLater()
                    }
                }
            }
        }
        sessionExpired?.let { expirations ->
            scope.launch { expirations.collect { expired -> mutableUiState.update { it.copy(sessionExpired = expired) } } }
        }
    }

    fun bind(post: PostDetail) {
        if (post.id != postId || boundPost) return
        boundPost = true
        mutableUiState.update { it.copy(post = post, commentsLoading = true, readLaterLoading = it.signedIn) }
        loadComments()
        if (mutableUiState.value.signedIn) loadReadLater()
    }

    fun toggleLike() {
        val post = mutableUiState.value.post ?: return
        if (!mutableUiState.value.signedIn || mutableUiState.value.likeBusy) return
        val desired = !post.liked
        val optimistic = post.copy(liked = desired, likeCount = (post.likeCount + if (desired) 1 else -1).coerceAtLeast(0))
        mutableUiState.update { it.copy(post = optimistic, likeBusy = true, likeError = null) }
        scope.launch {
            try {
                val result = repository.setPostLike(postId, desired)
                mutableUiState.update {
                    it.copy(post = it.post?.copy(liked = result.active, likeCount = result.count), likeBusy = false)
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                mutableUiState.update {
                    it.copy(post = it.post?.copy(liked = post.liked, likeCount = post.likeCount), likeBusy = false, likeError = SocialActionError.Request)
                }
            }
        }
    }

    fun toggleRecommendation() {
        val post = mutableUiState.value.post ?: return
        if (!mutableUiState.value.signedIn || mutableUiState.value.recommendationBusy) return
        val desired = !post.recommended
        val optimistic = post.copy(
            recommended = desired,
            recommendCount = (post.recommendCount + if (desired) 1 else -1).coerceAtLeast(0),
        )
        mutableUiState.update { it.copy(post = optimistic, recommendationBusy = true, recommendationError = null) }
        scope.launch {
            try {
                val result = repository.setPostRecommendation(postId, desired)
                mutableUiState.update {
                    it.copy(post = it.post?.copy(recommended = result.active, recommendCount = result.count), recommendationBusy = false)
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                mutableUiState.update {
                    it.copy(
                        post = it.post?.copy(recommended = post.recommended, recommendCount = post.recommendCount),
                        recommendationBusy = false,
                        recommendationError = SocialActionError.Request,
                    )
                }
            }
        }
    }

    fun toggleReadLater() {
        val state = mutableUiState.value
        val listId = state.readLaterListId ?: return
        if (!state.signedIn || state.readLaterBusy) return
        if (state.post == null) return
        val desired = !state.saved
        mutableUiState.update { it.copy(saved = desired, readLaterBusy = true, readLaterError = null) }
        scope.launch {
            try {
                repository.setReadLater(postId, listId, desired)
                mutableUiState.update { it.copy(readLaterBusy = false) }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                mutableUiState.update { it.copy(saved = !desired, readLaterBusy = false, readLaterError = SocialActionError.Request) }
            }
        }
    }

    fun retryReadLater() {
        if (mutableUiState.value.signedIn && !mutableUiState.value.readLaterLoading) loadReadLater()
    }

    fun updateDraft(value: String) {
        mutableUiState.update { it.copy(draft = value, commentError = null) }
    }

    fun replyTo(commentId: String?) {
        mutableUiState.update { it.copy(replyingTo = commentId, draft = "", commentError = null) }
    }

    fun submitComment() {
        val state = mutableUiState.value
        val content = state.draft.trim()
        val user = state.currentUser ?: return
        if (content.isEmpty() || state.commentBusy) return
        val parentId = state.replyingTo
        val pending =
            Comment(
                id = "pending-${Random.nextLong()}",
                content = content,
                createdAt = "",
                author = PostAuthor(user.id, user.username, user.displayName, null, false),
                parentId = parentId,
                likeCount = 0,
                liked = false,
                replies = emptyList(),
            )
        mutableUiState.update {
            it.copy(
                post = it.post?.let { post -> post.copy(commentCount = post.commentCount + 1) },
                comments = it.comments.addComment(pending),
                draft = "",
                replyingTo = null,
                commentBusy = true,
                commentError = null,
            )
        }
        scope.launch {
            try {
                val created = repository.createComment(postId, content, parentId)
                mutableUiState.update { it.copy(comments = it.comments.replaceComment(pending.id, created), commentBusy = false) }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                mutableUiState.update {
                    it.copy(
                        post = it.post?.let { post -> post.copy(commentCount = (post.commentCount - 1).coerceAtLeast(0)) },
                        comments = it.comments.removeComment(pending.id),
                        draft = content,
                        commentBusy = false,
                        commentError = SocialActionError.Comment,
                    )
                }
            }
        }
    }

    fun toggleCommentLike(commentId: String) {
        val state = mutableUiState.value
        if (!state.signedIn || commentId in state.commentBusyIds) return
        val comment = state.comments.findComment(commentId) ?: return
        val desired = !comment.liked
        mutableUiState.update {
            it.copy(
                comments = it.comments.updateComment(commentId) { current ->
                    current.copy(liked = desired, likeCount = (current.likeCount + if (desired) 1 else -1).coerceAtLeast(0))
                },
                commentBusyIds = it.commentBusyIds + commentId,
                commentError = null,
            )
        }
        scope.launch {
            try {
                val result = repository.setCommentLike(postId, commentId, desired)
                mutableUiState.update {
                    it.copy(
                        comments = it.comments.updateComment(commentId) { current -> current.copy(liked = result.active, likeCount = result.count) },
                        commentBusyIds = it.commentBusyIds - commentId,
                    )
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                mutableUiState.update {
                    it.copy(
                        comments =
                            it.comments.updateComment(commentId) { current ->
                                current.copy(liked = comment.liked, likeCount = comment.likeCount)
                            },
                        commentBusyIds = it.commentBusyIds - commentId,
                        commentError = SocialActionError.Request,
                    )
                }
            }
        }
    }

    fun beginEdit(comment: Comment) {
        if (mutableUiState.value.currentUser?.id != comment.author.id) return
        mutableUiState.update { it.copy(editingCommentId = comment.id, editDraft = comment.content, commentError = null) }
    }

    fun updateEditDraft(value: String) {
        mutableUiState.update { it.copy(editDraft = value, commentError = null) }
    }

    fun cancelEdit() {
        mutableUiState.update { it.copy(editingCommentId = null, editDraft = "") }
    }

    fun saveEdit() {
        val state = mutableUiState.value
        val commentId = state.editingCommentId ?: return
        val content = state.editDraft.trim()
        val before = state.comments.findComment(commentId) ?: return
        if (content.isEmpty() || content == before.content || state.editBusy) {
            cancelEdit()
            return
        }
        mutableUiState.update {
            it.copy(
                comments = it.comments.updateComment(commentId) { comment -> comment.copy(content = content) },
                editBusy = true,
                commentError = null,
            )
        }
        scope.launch {
            try {
                val actual = repository.editComment(postId, commentId, content)
                mutableUiState.update {
                    it.copy(
                        comments = it.comments.updateComment(commentId) { comment -> comment.copy(content = actual) },
                        editingCommentId = null,
                        editDraft = "",
                        editBusy = false,
                    )
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                mutableUiState.update {
                    it.copy(
                        comments = it.comments.updateComment(commentId) { before },
                        editBusy = false,
                        commentError = SocialActionError.Comment,
                    )
                }
            }
        }
    }

    fun requestDelete(commentId: String) {
        val comment = mutableUiState.value.comments.findComment(commentId) ?: return
        if (mutableUiState.value.currentUser?.id != comment.author.id) return
        mutableUiState.update { it.copy(deleteConfirmationId = commentId, commentError = null) }
    }

    fun cancelDelete() {
        mutableUiState.update { it.copy(deleteConfirmationId = null) }
    }

    fun confirmDelete() {
        val state = mutableUiState.value
        val commentId = state.deleteConfirmationId ?: return
        if (commentId in state.deleteBusyIds) return
        val comment = state.comments.findComment(commentId) ?: return
        if (state.currentUser?.id != comment.author.id) return
        val rootIndex = state.comments.indexOfFirst { it.id == commentId || it.replies.any { reply -> reply.id == commentId } }
        val countDelta = if (comment.parentId == null) 1 + comment.replies.size else 1
        mutableUiState.update {
            it.copy(
                post = it.post?.let { post -> post.copy(commentCount = (post.commentCount - countDelta).coerceAtLeast(0)) },
                comments = it.comments.removeComment(commentId),
                deleteConfirmationId = null,
                deleteBusyIds = it.deleteBusyIds + commentId,
                commentError = null,
            )
        }
        scope.launch {
            try {
                repository.deleteComment(postId, commentId)
                mutableUiState.update { it.copy(deleteBusyIds = it.deleteBusyIds - commentId) }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                mutableUiState.update {
                    it.copy(
                        post = it.post?.let { post -> post.copy(commentCount = post.commentCount + countDelta) },
                        comments = it.comments.restoreComment(comment, rootIndex),
                        deleteBusyIds = it.deleteBusyIds - commentId,
                        commentError = SocialActionError.Delete,
                    )
                }
            }
        }
    }

    fun loadMoreComments() {
        val cursor = mutableUiState.value.nextCommentCursor ?: return
        if (mutableUiState.value.commentsLoadingMore) return
        loadComments(cursor)
    }

    fun retryComments() {
        loadComments()
    }

    fun close() {
        scope.cancel()
    }

    private fun loadComments(cursor: String? = null) {
        mutableUiState.update {
            it.copy(
                commentsLoading = cursor == null,
                commentsLoadingMore = cursor != null,
                commentsError = null,
            )
        }
        scope.launch {
            try {
                val page = repository.postComments(postId, cursor)
                mutableUiState.update {
                    it.copy(
                        comments = if (cursor == null) page.items else it.comments + page.items,
                        nextCommentCursor = page.nextCursor,
                        commentsLoading = false,
                        commentsLoadingMore = false,
                        commentsError = null,
                    )
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                mutableUiState.update {
                    it.copy(
                        commentsLoading = false,
                        commentsLoadingMore = false,
                        commentsError = SocialContentError.Load,
                    )
                }
            }
        }
    }

    private fun loadReadLater() {
        mutableUiState.update { it.copy(readLaterLoading = true, readLaterError = null) }
        scope.launch {
            try {
                val saved = repository.readLaterState(postId)
                mutableUiState.update {
                    it.copy(readLaterListId = saved.listId, saved = saved.saved, readLaterLoading = false)
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {
                mutableUiState.update { it.copy(readLaterLoading = false, readLaterError = SocialActionError.Request) }
            }
        }
    }
}

data class PostSocialUiState(
    val post: PostDetail? = null,
    val comments: List<Comment> = emptyList(),
    val nextCommentCursor: String? = null,
    val commentsLoading: Boolean = false,
    val commentsLoadingMore: Boolean = false,
    val commentsError: SocialContentError? = null,
    val draft: String = "",
    val replyingTo: String? = null,
    val commentBusy: Boolean = false,
    val commentBusyIds: Set<String> = emptySet(),
    val commentError: SocialActionError? = null,
    val editingCommentId: String? = null,
    val editDraft: String = "",
    val editBusy: Boolean = false,
    val deleteConfirmationId: String? = null,
    val deleteBusyIds: Set<String> = emptySet(),
    val signedIn: Boolean = false,
    val currentUser: org.omicron.mobile.domain.model.AuthenticatedUser? = null,
    val sessionExpired: Boolean = false,
    val likeBusy: Boolean = false,
    val likeError: SocialActionError? = null,
    val recommendationBusy: Boolean = false,
    val recommendationError: SocialActionError? = null,
    val readLaterListId: String? = null,
    val readLaterLoading: Boolean = false,
    val saved: Boolean = false,
    val readLaterBusy: Boolean = false,
    val readLaterError: SocialActionError? = null,
)

enum class SocialContentError {
    Load,
}

enum class SocialActionError {
    Request,
    Comment,
    Delete,
}

private fun List<Comment>.addComment(comment: Comment): List<Comment> =
    if (comment.parentId == null) {
        listOf(comment) + this
    } else {
        map { thread ->
            if (thread.id == comment.parentId || thread.replies.any { it.id == comment.parentId }) {
                thread.copy(replies = thread.replies + comment)
            } else {
                thread
            }
        }
    }

private fun List<Comment>.restoreComment(comment: Comment, index: Int): List<Comment> =
    if (comment.parentId == null) {
        if (findComment(comment.id) != null) this else toMutableList().apply { add(index.coerceIn(0, size), comment) }
    } else {
        addComment(comment)
    }

private fun List<Comment>.replaceComment(id: String, replacement: Comment): List<Comment> =
    map { comment ->
        when {
            comment.id == id -> replacement
            comment.replies.any { it.id == id } -> comment.copy(replies = comment.replies.map { if (it.id == id) replacement else it })
            else -> comment
        }
    }

private fun List<Comment>.removeComment(id: String): List<Comment> =
    mapNotNull { comment ->
        when {
            comment.id == id -> null
            comment.replies.any { it.id == id } -> comment.copy(replies = comment.replies.filterNot { it.id == id })
            else -> comment
        }
    }

private fun List<Comment>.findComment(id: String): Comment? =
    firstNotNullOfOrNull { comment ->
        if (comment.id == id) comment else comment.replies.firstOrNull { it.id == id }
    }

private fun List<Comment>.updateComment(id: String, update: (Comment) -> Comment): List<Comment> =
    map { comment ->
        when {
            comment.id == id -> update(comment)
            comment.replies.any { it.id == id } -> comment.copy(replies = comment.replies.map { if (it.id == id) update(it) else it })
            else -> comment
        }
    }
