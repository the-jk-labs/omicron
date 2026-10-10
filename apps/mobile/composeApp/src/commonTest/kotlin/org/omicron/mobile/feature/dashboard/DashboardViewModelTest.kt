package org.omicron.mobile.feature.dashboard

import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.omicron.mobile.data.api.DashboardSummaryDto
import org.omicron.mobile.data.api.DashboardTotalsDto
import org.omicron.mobile.data.api.PostStatDto
import org.omicron.mobile.feature.navigation.FakeMobileWebApi
import org.omicron.mobile.feature.navigation.fakeMobileWebRepository
import kotlin.test.Test
import kotlin.test.assertEquals

class DashboardViewModelTest {
    @Test
    fun mapsAggregateStatsForDashboardContent() = runTest {
        val api =
            FakeMobileWebApi().apply {
                dashboardSummary =
                    DashboardSummaryDto(
                        onInstanceViews = true,
                        totals = DashboardTotalsDto(views = 20, likes = 4, comments = 2, followers = 9),
                        posts = listOf(PostStatDto("post-1", "Title", "title", "2026-01-01T00:00:00Z", 20, 4, 2)),
                    )
            }
        val viewModel = dashboardViewModel(api)
        testScheduler.advanceUntilIdle()

        assertEquals(DashboardPhase.Content, viewModel.uiState.value.phase)
        assertEquals(20, viewModel.uiState.value.summary?.totals?.views)
        assertEquals(1, viewModel.uiState.value.summary?.posts?.size)
        viewModel.close()
    }

    @Test
    fun emptyDashboardHasItsOwnPhaseAndFailuresCanRetry() = runTest {
        val api = FakeMobileWebApi().apply { failDashboard = true }
        val viewModel = dashboardViewModel(api)
        testScheduler.advanceUntilIdle()
        assertEquals(DashboardPhase.Error, viewModel.uiState.value.phase)

        api.failDashboard = false
        viewModel.retry()
        testScheduler.advanceUntilIdle()
        assertEquals(DashboardPhase.Empty, viewModel.uiState.value.phase)
        viewModel.close()
    }

    private fun TestScope.dashboardViewModel(api: FakeMobileWebApi) =
        DashboardViewModel(
            repository = fakeMobileWebRepository(api),
            scope = TestScope(StandardTestDispatcher(testScheduler)),
        )
}
