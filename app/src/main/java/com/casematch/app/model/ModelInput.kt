package com.casematch.app.model

/** Modelo escrito en el formulario de un grupo. [brand] vacío = detectarla según el nombre. */
data class ModelInput(val name: String, val brand: String = "")
