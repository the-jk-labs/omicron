package org.omicron.mobile.feature.navigation

import androidx.navigation.NavHostController

fun NavHostController.navigateTopLevel(
    route: Any,
    homeRoute: Any,
) {
    navigate(route) {
        popUpTo(homeRoute) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
