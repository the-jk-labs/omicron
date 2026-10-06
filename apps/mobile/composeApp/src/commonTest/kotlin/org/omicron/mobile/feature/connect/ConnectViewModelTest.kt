package org.omicron.mobile.feature.connect

import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.omicron.mobile.core.storage.InstanceStore
import org.omicron.mobile.data.api.InstanceApi
import org.omicron.mobile.data.api.InstanceInfoDto
import org.omicron.mobile.data.repository.InstanceRepository
import org.omicron.mobile.domain.model.InstanceConfiguration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class ConnectViewModelTest {
    @Test
    fun acceptsAnHttpsOriginWithoutATrailingSlash() {
        assertEquals("https://omicron.blog", normalizeOrigin("https://omicron.blog"))
    }

    @Test
    fun connectsAndPersistsTheNormalizedHttpsOrigin() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val store = FakeInstanceStore()
        val viewModel =
            ConnectViewModel(
                repository = InstanceRepository(FakeInstanceApi(), store),
                scope = TestScope(dispatcher),
            )
        testScheduler.advanceUntilIdle()

        viewModel.updateOrigin("omicron.blog/")
        viewModel.connect()
        testScheduler.advanceUntilIdle()

        assertEquals("https://omicron.blog", store.configuration?.origin)
        assertIs<ConnectPhase.Connected>(viewModel.uiState.value.phase)
    }

    @Test
    fun rejectsNonHttpsOrigins() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel =
            ConnectViewModel(
                repository = InstanceRepository(FakeInstanceApi(), FakeInstanceStore()),
                scope = TestScope(dispatcher),
            )
        testScheduler.advanceUntilIdle()

        viewModel.updateOrigin("http://omicron.blog")
        viewModel.connect()

        assertEquals(ConnectError.InvalidAddress, (viewModel.uiState.value.phase as ConnectPhase.Error).error)
    }
}

private class FakeInstanceApi : InstanceApi {
    override suspend fun getInstance(origin: String): InstanceInfoDto =
        InstanceInfoDto(
            name = "Omicron",
            domain = "omicron.blog",
            federationEnabled = true,
            setupComplete = true,
            emailEnabled = true,
            emailVerificationRequired = true,
        )
}

private class FakeInstanceStore : InstanceStore {
    var configuration: InstanceConfiguration? = null

    override suspend fun read(): InstanceConfiguration? = configuration

    override suspend fun write(configuration: InstanceConfiguration) {
        this.configuration = configuration
    }
}
