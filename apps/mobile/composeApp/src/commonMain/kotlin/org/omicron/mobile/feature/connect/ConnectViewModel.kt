package org.omicron.mobile.feature.connect

import io.ktor.http.URLProtocol
import io.ktor.http.Url
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.omicron.mobile.data.repository.InstanceRepository
import org.omicron.mobile.domain.model.InstanceConfiguration

const val DEFAULT_INSTANCE_ORIGIN = "https://omicron.blog"

class ConnectViewModel(
    private val repository: InstanceRepository,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
) {
    private val mutableUiState = MutableStateFlow(ConnectUiState())
    val uiState: StateFlow<ConnectUiState> = mutableUiState.asStateFlow()

    init {
        scope.launch {
            val savedInstance = repository.savedInstance()
            mutableUiState.update {
                it.copy(
                    origin = savedInstance?.origin ?: it.origin,
                    isRestoring = false,
                    phase = savedInstance?.let(ConnectPhase::Connected) ?: ConnectPhase.Editing,
                )
            }
        }
    }

    fun updateOrigin(origin: String) {
        mutableUiState.update { it.copy(origin = origin, phase = ConnectPhase.Editing) }
    }

    fun connect() {
        val origin = normalizeOrigin(mutableUiState.value.origin)
        if (origin == null) {
            mutableUiState.update { it.copy(phase = ConnectPhase.Error(ConnectError.InvalidAddress)) }
            return
        }

        scope.launch {
            mutableUiState.update { it.copy(origin = origin, phase = ConnectPhase.Connecting) }
            runCatching { repository.connect(origin) }
                .onSuccess { instance ->
                    mutableUiState.update { it.copy(phase = ConnectPhase.Connected(instance)) }
                }.onFailure {
                    mutableUiState.update { it.copy(phase = ConnectPhase.Error(ConnectError.Unreachable)) }
                }
        }
    }

    fun changeInstance() {
        mutableUiState.update { it.copy(phase = ConnectPhase.Editing) }
    }

    fun close() {
        scope.cancel()
    }
}

data class ConnectUiState(
    val origin: String = DEFAULT_INSTANCE_ORIGIN,
    val isRestoring: Boolean = true,
    val phase: ConnectPhase = ConnectPhase.Editing,
)

sealed interface ConnectPhase {
    data object Editing : ConnectPhase

    data object Connecting : ConnectPhase

    data class Error(
        val error: ConnectError,
    ) : ConnectPhase

    data class Connected(
        val instance: InstanceConfiguration,
    ) : ConnectPhase
}

enum class ConnectError {
    InvalidAddress,
    Unreachable,
}

fun normalizeOrigin(value: String): String? =
    runCatching {
        val candidate = value.trim().let { if ("://" in it) it else "https://$it" }
        val authority = candidate.substringAfter("://").substringBefore('/')
        val url = Url(candidate)
        require(url.protocol == URLProtocol.HTTPS)
        require(url.host.isNotBlank())
        require(url.encodedPath.isEmpty() || url.encodedPath == "/")
        require(url.parameters.isEmpty())
        require(url.fragment.isEmpty())
        require('@' !in authority)
        url.toString().removeSuffix("/")
    }.getOrNull()
