package org.omicron.mobile.data.repository

import io.ktor.client.plugins.ClientRequestException
import io.ktor.http.HttpStatusCode
import org.omicron.mobile.data.api.AuthoringApi
import org.omicron.mobile.data.api.BarePostDto
import org.omicron.mobile.data.api.CoverCreditDto
import org.omicron.mobile.data.api.CreatePostRequest
import org.omicron.mobile.data.api.UpdatePostRequest
import org.omicron.mobile.domain.model.CoverCredit
import org.omicron.mobile.domain.model.CreatePostInput
import org.omicron.mobile.domain.model.InstanceConfiguration
import org.omicron.mobile.domain.model.OwnCounts
import org.omicron.mobile.domain.model.OwnPost
import org.omicron.mobile.domain.model.OwnPostStatus
import org.omicron.mobile.domain.model.UpdatePostInput
import org.omicron.mobile.domain.model.UploadedImage

class AuthoringRepository(
    private val api: AuthoringApi,
    private val savedInstance: suspend () -> InstanceConfiguration?,
    private val accessToken: (suspend (origin: String) -> String?)? = null,
    private val onUnauthorized: (suspend () -> Unit)? = null,
) {
    suspend fun createPost(input: CreatePostInput): OwnPost {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return authorized(origin) { token ->
            api.createPost(
                origin,
                CreatePostRequest(
                    title = input.title?.trim()?.ifEmpty { null },
                    contentHtml = input.contentHtml,
                    status = input.status?.toWire(),
                    publishAt = input.publishAt,
                    language = input.language,
                    summary = input.summary,
                    coverUrl = input.coverUrl,
                    coverCredit = input.coverCredit?.toDto(),
                    tags = input.tags,
                ),
                token,
            ).toDomain(origin)
        }
    }

    suspend fun updatePost(id: String, input: UpdatePostInput): OwnPost {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return authorized(origin) { token ->
            api.updatePost(
                origin,
                id,
                UpdatePostRequest(
                    title = input.title?.trim()?.ifEmpty { null },
                    contentHtml = input.contentHtml,
                    status = input.status?.toWire(),
                    publishAt = input.publishAt,
                    language = input.language,
                    summary = input.summary,
                    coverUrl = input.coverUrl,
                    coverCredit = input.coverCredit?.toDto(),
                    tags = input.tags,
                ),
                token,
            ).toDomain(origin)
        }
    }

    suspend fun deletePost(id: String, notify: Boolean = false) {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        authorized(origin) { token -> api.deletePost(origin, id, notify, token) }
    }

    suspend fun drafts(cursor: String?): TimelinePage {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        val page = authorized(origin) { token -> api.drafts(origin, cursor, token) }
        return TimelinePage(page.items.map { it.toDomain(origin) }, page.nextCursor)
    }

    suspend fun ownPosts(status: OwnPostStatus, cursor: String?): TimelinePage {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        val page = authorized(origin) { token -> api.ownPosts(origin, status.toWire(), cursor, token) }
        return TimelinePage(page.items.map { it.toDomain(origin) }, page.nextCursor)
    }

    suspend fun ownCounts(): OwnCounts {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return authorized(origin) { token ->
            val counts = api.ownCounts(origin, token)
            OwnCounts(draft = counts.draft, scheduled = counts.scheduled, published = counts.published)
        }
    }

    suspend fun uploadImage(bytes: ByteArray, contentType: String): UploadedImage {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return authorized(origin) { token ->
            UploadedImage(url = resolveMediaUrl(origin, api.uploadImage(origin, bytes, contentType, token).url))
        }
    }

    private suspend fun <T> authorized(
        origin: String,
        block: suspend (accessToken: String) -> T,
    ): T =
        try {
            block(accessToken?.invoke(origin) ?: throw UnauthorizedException())
        } catch (exception: ClientRequestException) {
            if (exception.response.status != HttpStatusCode.Unauthorized) throw exception
            onUnauthorized?.invoke()
            throw UnauthorizedException()
        }
}

private fun OwnPostStatus.toWire(): String =
    when (this) {
        OwnPostStatus.Draft -> "draft"
        OwnPostStatus.Scheduled -> "scheduled"
        OwnPostStatus.Published -> "published"
    }

private fun String?.toStatus(): OwnPostStatus =
    when (this) {
        "draft" -> OwnPostStatus.Draft
        "scheduled" -> OwnPostStatus.Scheduled
        else -> OwnPostStatus.Published
    }

private fun BarePostDto.toDomain(origin: String) =
    OwnPost(
        id = id,
        title = title,
        slug = slug,
        status = status.toStatus(),
        publishAt = publishAt,
        language = language,
        summary = summary?.trim()?.ifEmpty { null },
        coverUrl = coverUrl?.let { resolveMediaUrl(origin, it) },
        createdAt = createdAt,
    )

private fun CoverCredit.toDto() =
    CoverCreditDto(
        name = name,
        nameUrl = nameUrl,
        source = source,
        sourceUrl = sourceUrl,
        license = license,
        licenseUrl = licenseUrl,
    )
