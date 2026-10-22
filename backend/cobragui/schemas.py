"""Request bodies. Responses are plain dicts built by the services (camelCase keys, JSON-safe floats)."""
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class ObjectiveSpec(Camel):
    """Linear objective: reaction id -> coefficient."""
    coefficients: dict[str, float]
    direction: Literal["max", "min"] = "max"


class StateSpec(Camel):
    """A model state is a set of overrides on top of the imported model.

    Bounds use null for an unbounded side (JSON has no infinity).
    objective = None keeps the objective stored in the model file.
    """
    id: Optional[str] = None
    name: Optional[str] = None
    bounds: dict[str, tuple[Optional[float], Optional[float]]] = Field(default_factory=dict)
    objective: Optional[ObjectiveSpec] = None


class SimulationParams(Camel):
    fraction_of_optimum: float = Field(1.0, ge=0.0, le=1.0)
    loopless: bool = False
    reactions: Optional[list[str]] = None
    pfba_factor: Optional[float] = Field(None, ge=1.0)
    processes: int = Field(1, ge=1, le=32)


class SimulationRequest(Camel):
    state: StateSpec = Field(default_factory=StateSpec)
    params: SimulationParams = Field(default_factory=SimulationParams)
    name: Optional[str] = None
    # client-generated id: lets the UI follow progress and cancel the run (GET/POST /api/jobs/{id})
    job_id: Optional[str] = None


class CancelRequest(Camel):
    """keep = True stops an FVA early but returns the intervals already computed."""
    keep: bool = False


class StateRequest(Camel):
    state: StateSpec = Field(default_factory=StateSpec)


class MediumUpdate(Camel):
    state: StateSpec = Field(default_factory=StateSpec)
    medium: dict[str, float]


class MediumPresetRequest(Camel):
    state: StateSpec = Field(default_factory=StateSpec)
    preset: Literal["original", "minimal", "rich", "anaerobic"]
    rich_uptake: float = Field(10.0, gt=0)
    growth_fraction: float = Field(1.0, gt=0, le=1.0)


class ResultPayload(Camel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="allow")
    id: Optional[str] = None
    name: str = ""
    method: str = "fba"
    solver_status: Optional[str] = None
    objective_value: Optional[float] = None
    reaction_fluxes: Optional[dict[str, Optional[float]]] = None
    fva: Optional[dict[str, dict[str, Optional[float]]]] = None
    metabolite_turnover: Optional[dict[str, Optional[float]]] = None
    exchanges: Optional[dict[str, dict[str, Any]]] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class CompareRequest(Camel):
    a: ResultPayload
    b: ResultPayload
    zero_tolerance: float = Field(1e-9, ge=0)
    pseudocount: Optional[float] = Field(None, gt=0)


class DeriveRequest(Camel):
    """A flux vector read from a file; turnover and exchanges are recomputed with the loaded model."""
    fluxes: dict[str, Optional[float]]


class ExplainRequest(Camel):
    metabolite: str
    fluxes_a: dict[str, Optional[float]]
    fluxes_b: dict[str, Optional[float]]
    zero_tolerance: float = Field(1e-9, ge=0)


class ExportResultRequest(Camel):
    result: ResultPayload
    format: Literal["json", "csv"] = "json"
    table: Literal["fluxes", "fva", "turnover", "exchanges"] = "fluxes"


class EditRequest(Camel):
    """Structural edit: operations applied as one transaction (see edit_service).

    put_reaction {id?, reaction}, put_metabolite {id?, metabolite}, add_compartment {id, name},
    delete_reaction {id}, delete_metabolite {id, cascade?}. id = the entity being edited (absent = create).
    """
    ops: list[dict[str, Any]]
    label: Optional[str] = None


class ExportModelRequest(Camel):
    state: StateSpec = Field(default_factory=StateSpec)
    format: Literal["sbml", "json", "mat"] = "sbml"


class AnnotationAnalyzeRequest(Camel):
    use_names: bool = True
    auto_apply: bool = True
    fill_formulas: bool = True


class AnnotationChoice(Camel):
    id: str
    mnx: Optional[str] = None
    fill_formula: bool = True
    # same compound in another compartment: take the MetaNetX candidate chosen for that metabolite
    like: Optional[str] = None


class AnnotationApplyRequest(Camel):
    items: list[AnnotationChoice]


class AnnotationIdsRequest(Camel):
    """ids = None reverts every accepted match."""
    ids: Optional[list[str]] = None


class IdentityParticipant(Camel):
    """A template reaction participant: identifiers by namespace (kegg.compound, chebi, metanetx.chemical …)."""
    name: Optional[str] = None
    identifiers: dict[str, list[str]] = Field(default_factory=dict)
    coefficient: float = -1
    main: bool = True
    # conceptual template compartment (cytosol, mitochondria …), compared with BiGG compartments
    compartment: Optional[str] = None


class ReactionIdentityRequest(Camel):
    participants: list[IdentityParticipant]
    ec: list[str] = Field(default_factory=list)


class TemplateEntityIds(Camel):
    id: str
    identifiers: dict[str, list[str]] = Field(default_factory=dict)


class TemplateReactionIds(Camel):
    id: str
    participants: list[IdentityParticipant] = Field(default_factory=list)
    ec: list[str] = Field(default_factory=list)
    identifiers: dict[str, list[str]] = Field(default_factory=dict)


class BiggIdsRequest(Camel):
    entities: list[TemplateEntityIds] = Field(default_factory=list)
    reactions: list[TemplateReactionIds] = Field(default_factory=list)
