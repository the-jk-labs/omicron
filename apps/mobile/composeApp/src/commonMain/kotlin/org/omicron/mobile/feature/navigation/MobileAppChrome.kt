package org.omicron.mobile.feature.navigation

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import coil3.compose.AsyncImage
import org.jetbrains.compose.resources.painterResource
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.rikkaui.button.Button
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonAnimation
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.button.ButtonVariant
import org.omicron.mobile.core.designsystem.rikkaui.button.IconButton
import org.omicron.mobile.core.designsystem.rikkaui.button.IconButtonSize
import org.omicron.mobile.core.designsystem.rikkaui.icon.Icon
import org.omicron.mobile.core.designsystem.rikkaui.icon.IconSize
import org.omicron.mobile.core.designsystem.rikkaui.icon.RikkaIcons
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.domain.model.AuthenticatedUser
import org.omicron.mobile.domain.model.MobileNotification
import org.omicron.mobile.feature.common.notificationAction
import org.omicron.mobile.feature.common.notificationIcon
import org.omicron.mobile.feature.common.notificationSubject
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.app_name
import org.omicron.mobile.resources.navigation_account_menu
import org.omicron.mobile.resources.navigation_home
import org.omicron.mobile.resources.navigation_lists
import org.omicron.mobile.resources.navigation_notifications
import org.omicron.mobile.resources.navigation_profile
import org.omicron.mobile.resources.navigation_search
import org.omicron.mobile.resources.navigation_settings
import org.omicron.mobile.resources.navigation_sign_in
import org.omicron.mobile.resources.navigation_sign_out
import org.omicron.mobile.resources.navigation_stats
import org.omicron.mobile.resources.navigation_toggle_theme
import org.omicron.mobile.resources.navigation_see_all
import org.omicron.mobile.resources.navigation_write
import org.omicron.mobile.resources.navigation_your_posts
import org.omicron.mobile.resources.omicron_logo
import org.omicron.mobile.resources.notifications_empty
import org.omicron.mobile.resources.notifications_loading
import org.omicron.mobile.resources.notifications_title
import zed.rainxch.rikkaui.foundation.RikkaTheme

enum class PrimaryTab {
    Home,
    Lists,
    Write,
    Stats,
    Profile,
}

enum class AccountAction {
    Profile,
    Lists,
    Write,
    Stats,
    YourPosts,
    Settings,
    SignIn,
    Register,
    SignOut,
}

@Composable
fun MobileTopBar(
    appName: String,
    user: AuthenticatedUser?,
    darkTheme: Boolean,
    unreadCount: Int,
    onSearch: () -> Unit,
    onToggleTheme: () -> Unit,
    onNotifications: () -> Unit,
    notifications: List<MobileNotification> = emptyList(),
    notificationsLoading: Boolean = false,
    onRefreshNotifications: () -> Unit = {},
    onOpenNotification: (MobileNotification) -> Unit = {},
    onAccountAction: (AccountAction) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(
                painter = painterResource(Res.drawable.omicron_logo),
                contentDescription = null,
                modifier = Modifier.size(28.dp),
            )
            Text(
                text = appName.ifBlank { stringResource(Res.string.app_name) },
                variant = TextVariant.H2,
                color = OmicronTheme.colors.foreground,
                style = TextStyle(fontSize = 20.sp, lineHeight = 24.sp, fontWeight = FontWeight.Bold),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.widthIn(max = 170.dp),
            )
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                icon = RikkaIcons.Search,
                contentDescription = stringResource(Res.string.navigation_search),
                onClick = onSearch,
                size = IconButtonSize.Default,
            )
            IconButton(
                icon = if (darkTheme) RikkaIcons.Sun else RikkaIcons.Moon,
                contentDescription = stringResource(Res.string.navigation_toggle_theme),
                onClick = onToggleTheme,
                size = IconButtonSize.Default,
            )
            if (user != null) {
                NotificationMenu(
                    unreadCount = unreadCount,
                    items = notifications,
                    loading = notificationsLoading,
                    onOpenAll = onNotifications,
                    onRefresh = onRefreshNotifications,
                    onOpenNotification = onOpenNotification,
                )
                AccountMenu(user = user, onAction = onAccountAction)
            } else {
                IconButton(
                    icon = RikkaIcons.Settings,
                    contentDescription = stringResource(Res.string.navigation_settings),
                    onClick = { onAccountAction(AccountAction.Settings) },
                    size = IconButtonSize.Default,
                )
                Button(
                    text = stringResource(Res.string.navigation_sign_in),
                    onClick = { onAccountAction(AccountAction.SignIn) },
                    variant = ButtonVariant.Ghost,
                    size = ButtonSize.Sm,
                )
            }
        }
    }
}

@Composable
fun MobileBottomBar(
    selected: PrimaryTab?,
    onSelect: (PrimaryTab) -> Unit,
) {
    val borderColor = OmicronTheme.colors.borderCard
    val items =
        listOf(
            PrimaryTab.Home to (RikkaIcons.Home to Res.string.navigation_home),
            PrimaryTab.Lists to (RikkaIcons.Library to Res.string.navigation_lists),
            PrimaryTab.Write to (RikkaIcons.PenLine to Res.string.navigation_write),
            PrimaryTab.Stats to (RikkaIcons.Chart to Res.string.navigation_stats),
            PrimaryTab.Profile to (RikkaIcons.User to Res.string.navigation_profile),
        )
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .drawBehind {
                    drawLine(
                        color = borderColor,
                        start = androidx.compose.ui.geometry.Offset(0f, 0f),
                        end = androidx.compose.ui.geometry.Offset(size.width, 0f),
                        strokeWidth = 1.dp.toPx(),
                    )
                }.background(OmicronTheme.colors.background.copy(alpha = 0.96f))
                .padding(horizontal = 4.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items.forEach { (tab, item) ->
            val active = tab == selected
            val tint = if (active) OmicronTheme.colors.foreground else OmicronTheme.colors.mutedForeground
            Button(
                onClick = { onSelect(tab) },
                modifier = Modifier.weight(1f).height(58.dp),
                variant = ButtonVariant.Ghost,
                size = ButtonSize.Sm,
                animation = ButtonAnimation.Scale,
                selected = active,
                role = androidx.compose.ui.semantics.Role.Tab,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Icon(imageVector = item.first, contentDescription = null, tint = tint, size = IconSize.Lg)
                    Text(
                        text = stringResource(item.second),
                        variant = TextVariant.Small,
                        color = tint,
                        style = androidx.compose.ui.text.TextStyle(fontSize = 11.sp),
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun NotificationMenu(
    unreadCount: Int,
    items: List<MobileNotification>,
    loading: Boolean,
    onOpenAll: () -> Unit,
    onRefresh: () -> Unit,
    onOpenNotification: (MobileNotification) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val density = LocalDensity.current
    val popupWidth = (LocalConfiguration.current.screenWidthDp - 32).coerceIn(240, 328).dp
    Box {
        Box {
            IconButton(
                icon = RikkaIcons.Bell,
                contentDescription = stringResource(Res.string.navigation_notifications),
                onClick = {
                    expanded = true
                    onRefresh()
                },
                size = IconButtonSize.Default,
            )
            if (unreadCount > 0) {
                Box(
                    modifier =
                        Modifier
                            .align(Alignment.TopEnd)
                            .padding(top = 2.dp)
                            .defaultMinSize(minWidth = 16.dp, minHeight = 16.dp)
                            .clip(CircleShape)
                            .background(OmicronTheme.colors.destructive)
                            .padding(horizontal = 3.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = if (unreadCount > 99) "99+" else unreadCount.toString(),
                        variant = TextVariant.Small,
                        color = OmicronTheme.colors.background,
                        style = TextStyle(fontSize = 9.sp, lineHeight = 10.sp, fontWeight = FontWeight.SemiBold),
                        maxLines = 1,
                    )
                }
            }
        }
        if (expanded) {
            Popup(
                alignment = Alignment.TopEnd,
                offset = with(density) { IntOffset(48.dp.roundToPx(), 48.dp.roundToPx()) },
                onDismissRequest = { expanded = false },
                properties = PopupProperties(focusable = true),
            ) {
                Column(
                    modifier =
                        Modifier
                            .width(popupWidth)
                            .heightIn(max = 480.dp)
                            .clip(RoundedCornerShape(OmicronTheme.radii.cardSmall))
                            .background(OmicronTheme.colors.background)
                            .border(1.dp, OmicronTheme.colors.borderCard, RoundedCornerShape(OmicronTheme.radii.cardSmall))
                            .padding(8.dp),
                ) {
                    Text(
                        text = stringResource(Res.string.notifications_title),
                        variant = TextVariant.H4,
                        color = OmicronTheme.colors.foreground,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                    )
                    MenuDivider()
                    if (loading && items.isEmpty()) {
                        Text(
                            text = stringResource(Res.string.notifications_loading),
                            variant = TextVariant.Small,
                            color = OmicronTheme.colors.mutedForeground,
                            modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp),
                        )
                    } else if (items.isEmpty()) {
                        Text(
                            text = stringResource(Res.string.notifications_empty),
                            variant = TextVariant.Small,
                            color = OmicronTheme.colors.mutedForeground,
                            modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp),
                        )
                    } else {
                        Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                            items.take(5).forEach { notification ->
                                NotificationPreviewRow(notification) {
                                    expanded = false
                                    onOpenNotification(notification)
                                }
                            }
                        }
                    }
                    MenuDivider()
                    Button(
                        onClick = {
                            expanded = false
                            onOpenAll()
                        },
                        modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp),
                        variant = ButtonVariant.Ghost,
                        size = ButtonSize.Sm,
                        animation = ButtonAnimation.None,
                    ) {
                        Text(text = stringResource(Res.string.navigation_see_all), variant = TextVariant.P)
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationPreviewRow(
    notification: MobileNotification,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().heightIn(min = 60.dp),
        variant = ButtonVariant.Ghost,
        size = ButtonSize.Sm,
        animation = ButtonAnimation.None,
        label = "${notification.actor?.displayName.orEmpty()} ${stringResource(notificationAction(notification.type))}",
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier.size(36.dp).clip(CircleShape).background(RikkaTheme.colors.muted),
                contentAlignment = Alignment.Center,
            ) {
                val actor = notification.actor
                if (actor == null) {
                    Icon(imageVector = notificationIcon(notification.type), contentDescription = null, tint = OmicronTheme.colors.mutedForeground, size = IconSize.Default)
                } else {
                    Text(text = actor.displayName.trim().firstOrNull()?.uppercase() ?: "?", variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground)
                    actor.avatarUrl?.let { url -> AsyncImage(model = url, contentDescription = null, modifier = Modifier.size(36.dp).clip(CircleShape)) }
                }
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = notificationSubject(notification),
                    variant = TextVariant.Small,
                    color = OmicronTheme.colors.foreground,
                    maxLines = 1,
                )
                Text(
                    text = stringResource(notificationAction(notification.type)),
                    variant = TextVariant.Small,
                    color = OmicronTheme.colors.mutedForeground,
                    maxLines = 1,
                )
                val context = notification.postTitle ?: notification.commentSnippet
                context?.let { Text(text = it, variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground, maxLines = 1) }
            }
            if (!notification.read) {
                Box(modifier = Modifier.size(7.dp).clip(CircleShape).background(OmicronTheme.colors.accent))
            }
        }
    }
}

@Composable
private fun AccountMenu(
    user: AuthenticatedUser,
    onAction: (AccountAction) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val density = LocalDensity.current
    val accountMenuLabel = stringResource(Res.string.navigation_account_menu)
    Box {
        Box(
            modifier =
                Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .semantics {
                        contentDescription = accountMenuLabel
                    }.clickable(role = Role.Button) { expanded = true },
            contentAlignment = Alignment.Center,
        ) {
            AccountAvatar(user)
        }
        if (expanded) {
            Popup(
                alignment = Alignment.TopEnd,
                offset = with(density) { IntOffset(0, 48.dp.roundToPx()) },
                onDismissRequest = { expanded = false },
                properties = PopupProperties(focusable = true),
            ) {
                Column(
                    modifier =
                        Modifier
                            .width(236.dp)
                            .clip(RoundedCornerShape(OmicronTheme.radii.cardSmall))
                            .background(OmicronTheme.colors.background)
                            .border(1.dp, OmicronTheme.colors.borderCard, RoundedCornerShape(OmicronTheme.radii.cardSmall))
                            .padding(8.dp),
                ) {
                    Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp)) {
                        Text(text = user.displayName, variant = TextVariant.P, color = OmicronTheme.colors.foreground, maxLines = 1)
                        Text(text = "@${user.username}", variant = TextVariant.Small, color = OmicronTheme.colors.mutedForeground, maxLines = 1)
                    }
                    MenuDivider()
                    AccountMenuItem(RikkaIcons.User, stringResource(Res.string.navigation_profile)) {
                        expanded = false
                        onAction(AccountAction.Profile)
                    }
                    AccountMenuItem(RikkaIcons.PenLine, stringResource(Res.string.navigation_write)) {
                        expanded = false
                        onAction(AccountAction.Write)
                    }
                    AccountMenuItem(RikkaIcons.FileText, stringResource(Res.string.navigation_your_posts)) {
                        expanded = false
                        onAction(AccountAction.YourPosts)
                    }
                    AccountMenuItem(RikkaIcons.Library, stringResource(Res.string.navigation_lists)) {
                        expanded = false
                        onAction(AccountAction.Lists)
                    }
                    AccountMenuItem(RikkaIcons.Chart, stringResource(Res.string.navigation_stats)) {
                        expanded = false
                        onAction(AccountAction.Stats)
                    }
                    MenuDivider()
                    AccountMenuItem(RikkaIcons.Settings, stringResource(Res.string.navigation_settings)) {
                        expanded = false
                        onAction(AccountAction.Settings)
                    }
                    MenuDivider()
                    AccountMenuItem(RikkaIcons.LogOut, stringResource(Res.string.navigation_sign_out)) {
                        expanded = false
                        onAction(AccountAction.SignOut)
                    }
                }
            }
        }
    }
}

@Composable
private fun AccountAvatar(user: AuthenticatedUser) {
    Box(
        modifier =
            Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(OmicronTheme.colors.muted)
                .border(1.dp, OmicronTheme.colors.borderCard, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = user.displayName.trim().firstOrNull()?.uppercase() ?: "?",
            variant = TextVariant.Small,
            color = OmicronTheme.colors.mutedForeground,
        )
        user.avatarUrl?.let { url ->
            AsyncImage(
                model = url,
                contentDescription = null,
                modifier = Modifier.size(36.dp).clip(CircleShape),
            )
        }
    }
}

@Composable
private fun AccountMenuItem(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp),
        variant = ButtonVariant.Ghost,
        size = ButtonSize.Sm,
        animation = ButtonAnimation.None,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = OmicronTheme.colors.foregroundAlt, size = IconSize.Default)
            Text(text = label, variant = TextVariant.P, color = OmicronTheme.colors.foreground)
            Spacer(modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun MenuDivider() {
    Spacer(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp)
                .height(1.dp)
                .background(OmicronTheme.colors.borderCard),
    )
}
