package org.omicron.mobile.data.repository

import org.omicron.mobile.data.api.CoverCreditDto
import org.omicron.mobile.data.api.PostAuthorDto
import org.omicron.mobile.data.api.PostDto
import org.omicron.mobile.data.api.PostsApi
import org.omicron.mobile.data.api.TagDto
import org.omicron.mobile.data.api.TimelineScope
import org.omicron.mobile.domain.model.CoverCredit
import org.omicron.mobile.domain.model.InstanceConfiguration
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.domain.model.PostAuthor
import org.omicron.mobile.domain.model.PostDetail
import org.omicron.mobile.domain.model.PostTag

class MissingInstanceException : IllegalStateException("No instance selected")

class PostsRepository(
    private val api: PostsApi,
    private val savedInstance: suspend () -> InstanceConfiguration?,
) {
    suspend fun origin(): String? = savedInstance()?.origin
    suspend fun timeline(
        scope: TimelineScope,
        cursor: String?,
    ): TimelinePage {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        val page = api.timeline(origin, scope, cursor)
        return TimelinePage(
            items = page.items.map { it.toDomain(origin) },
            nextCursor = page.nextCursor,
        )
    }

    suspend fun postDetail(id: String): PostDetail {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return api.post(origin, id).toDetail(origin)
    }

    suspend fun relatedPosts(id: String): List<Post> {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return api.relatedPosts(origin, id).map { it.toDomain(origin) }
    }
}

data class TimelinePage(
    val items: List<Post>,
    val nextCursor: String?,
)

private fun PostDto.toDomain(origin: String) =
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
    )

private fun PostAuthorDto.toDomain(origin: String) =
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
        createdAt = createdAt,
        author = author.toDomain(origin),
        tags = tags.map(TagDto::toDomain),
        likeCount = likeCount,
        commentCount = commentCount,
        recommendCount = recommendCount,
        remote = remote,
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
