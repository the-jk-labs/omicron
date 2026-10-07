package org.omicron.mobile.data.repository

import io.ktor.client.plugins.ClientRequestException
import io.ktor.http.HttpStatusCode
import org.omicron.mobile.data.api.CommentDto
import org.omicron.mobile.data.api.LocalProfileDto
import org.omicron.mobile.data.api.RemoteProfileDto
import org.omicron.mobile.data.api.SocialApi
import org.omicron.mobile.domain.model.Comment
import org.omicron.mobile.domain.model.CommentPage
import org.omicron.mobile.domain.model.LikeState
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.domain.model.PostTag
import org.omicron.mobile.domain.model.Profile
import org.omicron.mobile.domain.model.ProfileFollowState
import org.omicron.mobile.domain.model.ProfileLink
import org.omicron.mobile.domain.model.ProfileUser
import org.omicron.mobile.domain.model.ReadLaterState
import org.omicron.mobile.domain.model.RecommendationState
import org.omicron.mobile.domain.model.RelationActor

class SocialRepository(
    private val api: SocialApi,
    private val savedInstance: suspend () -> org.omicron.mobile.domain.model.InstanceConfiguration?,
    private val accessToken: (suspend (origin: String) -> String?)? = null,
    private val onUnauthorized: (suspend () -> Unit)? = null,
) {
    suspend fun postComments(postId: String, cursor: String?): CommentPage =
        withOrigin { origin ->
            authorized(origin) { token ->
                api.comments(origin, postId, cursor, token).let { page ->
                    CommentPage(page.items.map { it.toDomain(origin) }, page.nextCursor)
                }
            }
        }

    suspend fun createComment(postId: String, content: String, parentId: String?): Comment =
        withOrigin { origin ->
            authorized(origin, required = true) { token -> api.createComment(origin, postId, content, parentId, token!!).comment.toDomain(origin) }
        }

    suspend fun setPostLike(postId: String, liked: Boolean): LikeState =
        withOrigin { origin ->
            authorized(origin, required = true) { token ->
                api.postLike(origin, postId, liked, token!!).let { LikeState(it.likeCount, it.liked) }
            }
        }

    suspend fun setPostRecommendation(postId: String, recommended: Boolean): RecommendationState =
        withOrigin { origin ->
            authorized(origin, required = true) { token ->
                api.postRecommendation(origin, postId, recommended, token!!).let {
                    RecommendationState(it.recommendCount, it.recommended)
                }
            }
        }

    suspend fun setCommentLike(postId: String, commentId: String, liked: Boolean): LikeState =
        withOrigin { origin ->
            authorized(origin, required = true) { token ->
                api.commentLike(origin, postId, commentId, liked, token!!).let { LikeState(it.likeCount, it.liked) }
            }
        }

    suspend fun editComment(postId: String, commentId: String, content: String): String =
        withOrigin { origin ->
            authorized(origin, required = true) { token -> api.editComment(origin, postId, commentId, content, token!!).comment.content }
        }

    suspend fun deleteComment(postId: String, commentId: String) =
        withOrigin { origin -> authorized(origin, required = true) { token -> api.deleteComment(origin, postId, commentId, token!!) } }

    suspend fun readLaterState(postId: String): ReadLaterState =
        withOrigin { origin ->
            authorized(origin, required = true) { token ->
                val readLater = api.readLater(origin, token!!).list
                val lists = api.listsForPost(origin, postId, token).lists
                ReadLaterState(readLater.id, lists.firstOrNull { it.id == readLater.id }?.contains == true)
            }
        }

    suspend fun setReadLater(postId: String, listId: String, saved: Boolean) =
        withOrigin { origin ->
            authorized(origin, required = true) { token ->
                if (saved) api.addToList(origin, listId, postId, token!!) else api.removeFromList(origin, listId, postId, token!!)
            }
        }

    suspend fun profile(handle: String, remote: Boolean): Profile =
        withOrigin { origin ->
            authorized(origin) { token ->
                if (remote) {
                    api.remoteProfile(origin, handle, token).toDomain(origin)
                } else {
                    api.localProfile(origin, handle, token).toDomain(origin)
                }
            }
        }

    suspend fun profilePosts(handle: String, remote: Boolean, recommendations: Boolean, cursor: String?): TimelinePage =
        withOrigin { origin ->
            authorized(origin) { token ->
                val page =
                    if (remote) {
                        api.remoteProfilePosts(origin, handle, recommendations, cursor, token)
                    } else {
                        api.localProfilePosts(origin, handle, recommendations, cursor, token)
                    }
                TimelinePage(page.items.map { it.toDomain(origin) }, page.nextCursor)
            }
        }

    suspend fun profileRelations(handle: String, following: Boolean): List<RelationActor> =
        withOrigin { origin ->
            authorized(origin) { token ->
                api.profileRelations(origin, handle, following, token).items.map { actor ->
                    RelationActor(
                        id = actor.id,
                        username = actor.username,
                        displayName = actor.displayName,
                        avatarUrl = actor.avatarUrl?.let { resolveMediaUrl(origin, it) },
                        remote = actor.remote,
                    )
                }
            }
        }

    suspend fun setFollow(handle: String, remote: Boolean, following: Boolean): ProfileFollowState =
        withOrigin { origin ->
            authorized(origin, required = true) { token ->
                if (!following) {
                    api.setFollow(origin, handle, remote, false, token!!)
                    ProfileFollowState.None
                } else {
                    when (api.setFollow(origin, handle, remote, true, token!!).state) {
                        "requested" -> ProfileFollowState.Requested
                        "following" -> ProfileFollowState.Following
                        else -> ProfileFollowState.None
                    }
                }
            }
        }

    suspend fun setMuted(handle: String, remote: Boolean, muted: Boolean) =
        withOrigin { origin -> authorized(origin, required = true) { token -> api.setMute(origin, handle, remote, muted, token!!) } }

    suspend fun setBlocked(handle: String, remote: Boolean, blocked: Boolean) =
        withOrigin { origin -> authorized(origin, required = true) { token -> api.setBlock(origin, handle, remote, blocked, token!!) } }

    private suspend fun <T> withOrigin(block: suspend (String) -> T): T {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return block(origin)
    }

    private suspend fun <T> authorized(
        origin: String,
        required: Boolean = false,
        block: suspend (String?) -> T,
    ): T =
        try {
            val token = accessToken?.invoke(origin)
            if (required && token == null) throw UnauthorizedException()
            block(token)
        } catch (exception: ClientRequestException) {
            if (exception.response.status != HttpStatusCode.Unauthorized) throw exception
            onUnauthorized?.invoke()
            throw UnauthorizedException()
        }
}

private fun CommentDto.toDomain(origin: String): Comment =
    Comment(
        id = id,
        content = content,
        createdAt = createdAt,
        author = author.toDomain(origin),
        parentId = parentId,
        likeCount = likeCount,
        liked = liked,
        replies = replies.map { it.toDomain(origin) },
    )

private fun LocalProfileDto.toDomain(origin: String): Profile =
    Profile(
        user =
            ProfileUser(
                id = user.id,
                username = user.username,
                displayName = user.displayName,
                bio = user.bio,
                avatarUrl = user.avatarUrl?.let { resolveMediaUrl(origin, it) },
                createdAt = user.createdAt,
                isPrivate = user.isPrivate,
                tags = user.tags.map { PostTag(it.slug, it.name) },
                links = user.links.map { ProfileLink(it.label, it.url) },
                host = null,
                profileUrl = null,
            ),
        followerCount = counts.followers,
        followingCount = counts.following,
        followState = followState.toFollowState(),
        isFollowing = isFollowing,
        isMuted = isMuted,
        isBlocked = isBlocked,
        locked = locked,
        remote = false,
    )

private fun RemoteProfileDto.toDomain(origin: String): Profile =
    Profile(
        user =
            ProfileUser(
                id = user.id,
                username = user.username,
                displayName = user.displayName,
                bio = user.bio,
                avatarUrl = user.avatarUrl?.let { resolveMediaUrl(origin, it) },
                createdAt = "",
                isPrivate = false,
                tags = user.tags.map { PostTag(it.slug, it.name) },
                links = emptyList(),
                host = user.host,
                profileUrl = user.apId,
            ),
        followerCount = counts.followers,
        followingCount = counts.following,
        followState = if (isFollowing) ProfileFollowState.Following else ProfileFollowState.None,
        isFollowing = isFollowing,
        isMuted = isMuted,
        isBlocked = isBlocked,
        locked = false,
        remote = true,
    )

private fun String.toFollowState(): ProfileFollowState =
    when (this) {
        "requested" -> ProfileFollowState.Requested
        "following" -> ProfileFollowState.Following
        else -> ProfileFollowState.None
    }
