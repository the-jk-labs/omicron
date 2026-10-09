package org.omicron.mobile.data.api

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.Serializable

interface AuthoringApi {
    suspend fun createPost(
        origin: String,
        request: CreatePostRequest,
        accessToken: String,
    ): BarePostDto

    suspend fun updatePost(
        origin: String,
        id: String,
        request: UpdatePostRequest,
        accessToken: String,
    ): BarePostDto

    suspend fun deletePost(
        origin: String,
        id: String,
        notify: Boolean,
        accessToken: String,
    )

    suspend fun drafts(
        origin: String,
        cursor: String?,
        accessToken: String,
    ): TimelinePageDto

    suspend fun ownPosts(
        origin: String,
        status: String,
        cursor: String?,
        accessToken: String,
    ): TimelinePageDto

    suspend fun ownCounts(
        origin: String,
        accessToken: String,
    ): OwnCountsDto

    suspend fun uploadImage(
        origin: String,
        bytes: ByteArray,
        contentType: String,
        accessToken: String,
    ): UploadResponseDto
}

@Serializable
data class CreatePostRequest(
    @EncodeDefault(EncodeDefault.Mode.NEVER) val title: String? = null,
    val contentHtml: String,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val status: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val publishAt: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val language: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val summary: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val coverUrl: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val coverCredit: CoverCreditDto? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val tags: List<String>? = null,
)

@Serializable
data class UpdatePostRequest(
    @EncodeDefault(EncodeDefault.Mode.NEVER) val title: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val contentHtml: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val status: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val publishAt: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val language: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val summary: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val coverUrl: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val coverCredit: CoverCreditDto? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val tags: List<String>? = null,
)

@Serializable
data class BarePostDto(
    val id: String,
    val title: String? = null,
    val slug: String? = null,
    val contentHtml: String? = null,
    val status: String? = null,
    val publishAt: String? = null,
    val language: String? = null,
    val summary: String? = null,
    val coverUrl: String? = null,
    val bannerUrl: String? = null,
    val coverCredit: CoverCreditDto? = null,
    val createdAt: String,
)

@Serializable
data class SingleBarePostDto(
    val post: BarePostDto,
)

@Serializable
data class OwnCountsDto(
    val draft: Int = 0,
    val scheduled: Int = 0,
    val published: Int = 0,
)

@Serializable
data class UploadResponseDto(
    val url: String,
)
