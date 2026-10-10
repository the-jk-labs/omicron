package org.omicron.mobile.data.repository

import io.ktor.client.plugins.ClientRequestException
import io.ktor.http.HttpStatusCode
import org.omicron.mobile.data.api.CreateListRequestDto
import org.omicron.mobile.data.api.DashboardSummaryDto
import org.omicron.mobile.data.api.MobileWebApi
import org.omicron.mobile.data.api.NotificationDto
import org.omicron.mobile.data.api.PostStatDto
import org.omicron.mobile.data.api.ReadingListDetailDto
import org.omicron.mobile.data.api.ReadingListDto
import org.omicron.mobile.domain.model.CursorPage
import org.omicron.mobile.domain.model.DashboardTotals
import org.omicron.mobile.domain.model.DayTotals
import org.omicron.mobile.domain.model.ListOwner
import org.omicron.mobile.domain.model.MobileNotification as Notification
import org.omicron.mobile.domain.model.PostStat
import org.omicron.mobile.domain.model.ReadingList
import org.omicron.mobile.domain.model.ReadingListDetail
import org.omicron.mobile.domain.model.WriterDashboard
import org.omicron.mobile.domain.model.InstanceConfiguration

class MobileWebRepository(
    private val api: MobileWebApi,
    private val savedInstance: suspend () -> InstanceConfiguration?,
    private val accessToken: suspend (origin: String) -> String?,
    private val onUnauthorized: suspend () -> Unit = {},
) {
    suspend fun myLists(): List<ReadingList> {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return authorized(origin) { token -> api.myLists(origin, token).lists.map { it.toDomain() } }
    }

    suspend fun createList(
        title: String,
        description: String,
        visibility: String,
    ): ReadingList {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return authorized(origin) { token ->
            api.createList(
                origin,
                CreateListRequestDto(title = title.trim(), description = description.trim(), visibility = visibility),
                token,
            ).list.toDomain()
        }
    }

    suspend fun listDetail(listId: String): ReadingListDetail {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return authorized(origin) { token -> api.listDetail(origin, listId, token).toDomain() }
    }

    suspend fun listItems(
        listId: String,
        cursor: String?,
    ): CursorPage<org.omicron.mobile.domain.model.Post> {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return authorized(origin) { token ->
            val page = api.listItems(origin, listId, cursor, token)
            CursorPage(page.items.map { it.toDomain(origin) }, page.nextCursor)
        }
    }

    suspend fun dashboard(days: Int = 30): WriterDashboard {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return authorized(origin) { token -> api.dashboard(origin, days.coerceIn(1, 365), token).toDomain() }
    }

    suspend fun notifications(cursor: String?): CursorPage<Notification> {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return authorized(origin) { token ->
            val page = api.notifications(origin, cursor, token)
            CursorPage(page.items.map { it.toDomain(origin) }, page.nextCursor)
        }
    }

    suspend fun unreadNotificationCount(): Int {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        return authorized(origin) { token -> api.unreadNotificationCount(origin, token).count }
    }

    suspend fun markAllNotificationsRead() {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        authorized(origin) { token -> api.markAllNotificationsRead(origin, token) }
    }

    suspend fun markNotificationRead(notificationId: String) {
        val origin = savedInstance()?.origin ?: throw MissingInstanceException()
        authorized(origin) { token -> api.markNotificationRead(origin, notificationId, token) }
    }

    private suspend fun <T> authorized(
        origin: String,
        block: suspend (accessToken: String) -> T,
    ): T =
        try {
            block(accessToken(origin) ?: throw UnauthorizedException())
        } catch (exception: ClientRequestException) {
            if (exception.response.status != HttpStatusCode.Unauthorized) throw exception
            onUnauthorized()
            throw UnauthorizedException()
        }
}

private fun ReadingListDto.toDomain() =
    ReadingList(
        id = id,
        title = title,
        description = description,
        visibility = visibility,
        isReadLater = isReadLater,
        itemCount = itemCount,
        createdAt = createdAt,
    )

private fun ReadingListDetailDto.toDomain() =
    ReadingListDetail(
        list = list.toDomain(),
        isOwner = isOwner,
        owner = ListOwner(owner.username, owner.displayName),
    )

private fun DashboardSummaryDto.toDomain() =
    WriterDashboard(
        onInstanceViews = onInstanceViews,
        totals = DashboardTotals(totals.views, totals.likes, totals.comments, totals.followers),
        series = series.map { DayTotals(it.day, it.views) },
        posts = posts.map(PostStatDto::toDomain),
    )

private fun PostStatDto.toDomain() = PostStat(postId, title, slug, createdAt, views, likes, comments)

private fun NotificationDto.toDomain(origin: String) =
    Notification(
        id = id,
        type = type,
        actor = actor?.toDomain(origin),
        postId = postId,
        postTitle = postTitle,
        commentSnippet = commentSnippet,
        read = read,
        createdAt = createdAt,
    )
