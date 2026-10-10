package org.omicron.mobile.feature.common

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons
import org.omicron.mobile.domain.model.MobileNotification
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.notifications_comment
import org.omicron.mobile.resources.notifications_comment_like
import org.omicron.mobile.resources.notifications_follow
import org.omicron.mobile.resources.notifications_follow_accepted
import org.omicron.mobile.resources.notifications_follow_request
import org.omicron.mobile.resources.notifications_like
import org.omicron.mobile.resources.notifications_post_published
import org.omicron.mobile.resources.notifications_recommend
import org.omicron.mobile.resources.notifications_reply
import org.omicron.mobile.resources.notifications_scheduled_post
import org.omicron.mobile.resources.notifications_someone

@Composable
internal fun notificationSubject(notification: MobileNotification): String =
    if (notification.type == "post_published") {
        stringResource(Res.string.notifications_scheduled_post)
    } else {
        notification.actor?.displayName ?: stringResource(Res.string.notifications_someone)
    }

internal fun notificationAction(type: String) =
    when (type) {
        "follow" -> Res.string.notifications_follow
        "follow_request" -> Res.string.notifications_follow_request
        "follow_accepted" -> Res.string.notifications_follow_accepted
        "like" -> Res.string.notifications_like
        "comment" -> Res.string.notifications_comment
        "reply" -> Res.string.notifications_reply
        "comment_like" -> Res.string.notifications_comment_like
        "recommend" -> Res.string.notifications_recommend
        else -> Res.string.notifications_post_published
    }

internal fun notificationIcon(type: String): ImageVector =
    when (type) {
        "follow", "follow_accepted", "follow_request" -> RikkaIcons.Users
        "like", "comment_like" -> RikkaIcons.Heart
        "comment", "reply" -> RikkaIcons.MessageCircle
        "recommend" -> RikkaIcons.Repeat
        else -> RikkaIcons.Clock
    }
