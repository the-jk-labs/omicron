package org.omicron.mobile.data.repository

import io.ktor.client.plugins.ClientRequestException
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException
import org.omicron.mobile.data.cache.OfflinePostCache
import org.omicron.mobile.data.api.CoverCreditDto
import org.omicron.mobile.data.api.PostAuthorDto
import org.omicron.mobile.data.api.PostDto
import org.omicron.mobile.data.api.PostsApi
import org.omicron.mobile.data.api.TagDto
import org.omicron.mobile.data.api.TimelineScope
import org.omicron.mobile.domain.model.CoverCredit
import org.omicron.mobile.domain.model.InstanceConfiguration
import org.omicron.mobile.domain.model.OwnPostStatus
import org.omicron.mobile.domain.model.OfflinePostSummary
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.domain.model.PostAuthor
import org.omicron.mobile.domain.model.PostDetail
import org.omicron.mobile.domain.model.PostTag

class MissingInstanceException : IllegalStateException("No instance selected")

class UnauthorizedException : IllegalStateException("Signed in session is no longer valid")

class PostsRepository(
    private val api: PostsApi,
    private val savedInstance: suspend () -> InstanceConfiguration?,
    private val accessToken: (suspend (origin: String) -> String?)? = null,
    private val onUnauthorized: (suspend () -> Unit)? = null,
    private val offlinePostCache: OfflinePostCache? = null,
) {
    suspend fun origin(): String? = savedInstance()?.origin
    suspend fun timeline(
        scope: TimelineScope,
        cursor: String?,
    ): TimelinePage {
        require(scope != TimelineScope.ForYou) { "For you loads through feed()" }
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        val page = authorizedCall(origin) { token -> api.timeline(origin, scope, cursor, token) }
        return TimelinePage(
            items = page.items.map { it.toDomain(origin) },
            nextCursor = page.nextCursor,
        )
    }

    suspend fun feed(cursor: String?): TimelinePage {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        val page = authorizedCall(origin) { token -> api.feed(origin, cursor, token ?: throw UnauthorizedException()) }
        return TimelinePage(
            items = page.items.map { it.toDomain(origin) },
            nextCursor = page.nextCursor,
        )
    }

    suspend fun postDetail(id: String): PostDetail {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        val detail =
            try {
                authorizedCall(origin) { token -> api.post(origin, id, token) }.toDetail(origin)
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: IOException) {
                val cached =
                    try {
                        offlinePostCache?.read(origin, id)
                    } catch (cacheException: CancellationException) {
                        throw cacheException
                    } catch (_: Throwable) {
                        null
                    }
                return cached?.post?.copy(
                    liked = false,
                    recommended = false,
                    isOfflineCopy = true,
                    cachedAtMillis = cached.cachedAtMillis,
                ) ?: throw exception
            }
        if (detail.status == OwnPostStatus.Published) {
            try {
                offlinePostCache?.write(
                    origin,
                    detail.copy(liked = false, recommended = false, isOfflineCopy = false, cachedAtMillis = null),
                )
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Throwable) {}
        }
        return detail.copy(isOfflineCopy = false, cachedAtMillis = null)
    }

    suspend fun offlinePosts(): List<OfflinePostSummary> {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return offlinePostCache?.entries(origin).orEmpty().map { entry ->
            OfflinePostSummary(
                id = entry.post.id,
                title = entry.post.title,
                authorDisplayName = entry.post.author.displayName,
                summary = entry.post.summary,
                cachedAtMillis = entry.cachedAtMillis,
            )
        }
    }

    suspend fun removeOfflinePost(id: String) {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        offlinePostCache?.remove(origin, id)
    }

    suspend fun clearOfflinePosts() {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        offlinePostCache?.clear(origin)
    }

    suspend fun relatedPosts(id: String): List<Post> {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return authorizedCall(origin) { token -> api.relatedPosts(origin, id, token) }.map { it.toDomain(origin) }
    }

    private suspend fun <T> authorizedCall(
        origin: String,
        block: suspend (accessToken: String?) -> T,
    ): T =
        try {
            block(accessToken?.invoke(origin))
        } catch (exception: ClientRequestException) {
            if (exception.response.status != HttpStatusCode.Unauthorized) throw exception
            onUnauthorized?.invoke()
            throw UnauthorizedException()
        }
}

data class TimelinePage(
    val items: List<Post>,
    val nextCursor: String?,
)

internal fun PostDto.toDomain(origin: String) =
    Post(
        id = id,
        title = title,
        summary = summary?.trim()?.ifEmpty { null },
        bannerUrl = bannerUrl?.let { resolveMediaUrl(origin, it) },
        createdAt = createdAt,
        author = author.toDomain(origin),
        tags = tags.map(TagDto::toDomain),
        likeCount = likeCount,
        commentCount = commentCount,
        recommendCount = recommendCount,
        remote = remote,
        contentHtml = contentHtml,
        liked = liked,
        recommended = recommended,
    )

internal fun PostAuthorDto.toDomain(origin: String) =
    PostAuthor(
        id = id,
        username = username,
        displayName = displayName,
        avatarUrl = avatarUrl?.let { resolveMediaUrl(origin, it) },
        remote = remote,
    )

private fun PostDto.toDetail(origin: String) =
    PostDetail(
        id = id,
        title = title,
        contentHtml = contentHtml,
        coverUrl = coverUrl?.let { resolveMediaUrl(origin, it) },
        coverCredit = coverCredit?.toDomain(),
        language = language,
        summary = summary?.trim()?.ifEmpty { null },
        status = status.toStatus(),
        publishAt = publishAt,
        createdAt = createdAt,
        author = author.toDomain(origin),
        tags = tags.map(TagDto::toDomain),
        likeCount = likeCount,
        commentCount = commentCount,
        recommendCount = recommendCount,
        remote = remote,
        liked = liked,
        recommended = recommended,
    )

private fun CoverCreditDto.toDomain() =
    CoverCredit(
        name = name,
        nameUrl = nameUrl,
        source = source,
        sourceUrl = sourceUrl,
        license = license,
        licenseUrl = licenseUrl,
    )

private fun TagDto.toDomain() = PostTag(slug = slug, name = name)

fun resolveMediaUrl(
    origin: String,
    url: String,
): String = if (url.startsWith("/")) origin.trimEnd('/') + url else url
