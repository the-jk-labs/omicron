package org.omicron.mobile.data.api

import kotlinx.serialization.Serializable

interface MobileWebApi {
    suspend fun myLists(
        origin: String,
        accessToken: String,
    ): ReadingListsDto

    suspend fun createList(
        origin: String,
        request: CreateListRequestDto,
        accessToken: String,
    ): ReadingListEnvelopeDto

    suspend fun listDetail(
        origin: String,
        listId: String,
        accessToken: String,
    ): ReadingListDetailDto

    suspend fun listItems(
        origin: String,
        listId: String,
        cursor: String?,
        accessToken: String,
    ): TimelinePageDto

    suspend fun dashboard(
        origin: String,
        days: Int,
        accessToken: String,
    ): DashboardSummaryDto

    suspend fun notifications(
        origin: String,
        cursor: String?,
        accessToken: String,
    ): NotificationPageDto

    suspend fun unreadNotificationCount(
        origin: String,
        accessToken: String,
    ): UnreadNotificationCountDto

    suspend fun markAllNotificationsRead(
        origin: String,
        accessToken: String,
    )

    suspend fun markNotificationRead(
        origin: String,
        notificationId: String,
        accessToken: String,
    )
}

@Serializable
data class ReadingListDetailDto(
    val list: ReadingListDto,
    val isOwner: Boolean,
    val owner: ReadingListOwnerDto,
)

@Serializable
data class ReadingListOwnerDto(
    val username: String,
    val displayName: String,
)

@Serializable
data class CreateListRequestDto(
    val title: String,
    val description: String = "",
    val visibility: String = "public",
)

@Serializable
data class DashboardSummaryDto(
    val onInstanceViews: Boolean = false,
    val totals: DashboardTotalsDto = DashboardTotalsDto(),
    val series: List<DayTotalsDto> = emptyList(),
    val posts: List<PostStatDto> = emptyList(),
)

@Serializable
data class DashboardTotalsDto(
    val views: Int = 0,
    val likes: Int = 0,
    val comments: Int = 0,
    val followers: Int = 0,
)

@Serializable
data class DayTotalsDto(
    val day: String,
    val views: Int = 0,
)

@Serializable
data class PostStatDto(
    val postId: String,
    val title: String? = null,
    val slug: String? = null,
    val createdAt: String,
    val views: Int = 0,
    val likes: Int = 0,
    val comments: Int = 0,
)

@Serializable
data class NotificationPageDto(
    val items: List<NotificationDto> = emptyList(),
    val nextCursor: String? = null,
)

@Serializable
data class NotificationDto(
    val id: String,
    val type: String,
    val actor: PostAuthorDto? = null,
    val postId: String? = null,
    val postTitle: String? = null,
    val commentSnippet: String? = null,
    val read: Boolean = false,
    val createdAt: String,
)

@Serializable
data class UnreadNotificationCountDto(
    val count: Int = 0,
)
