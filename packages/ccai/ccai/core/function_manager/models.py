from typing import Callable, List, Dict, Any, Optional
from pydantic import BaseModel, Field
import inspect
import docstring_parser


class ParameterInfo(BaseModel):
    name: str
    annotation: type
    default: Optional[Any] = None
    description: str


class RegisteredFunction(BaseModel):
    name: str
    description: str
    parameters: List[ParameterInfo]
    return_type: Any
    return_description: str
    func: Callable = Field(repr=False)

    @classmethod
    def from_function(cls, func: Callable) -> "RegisteredFunction":
        name = func.__name__

        docstring = func.__doc__ or ""
        parsed_docstring = docstring_parser.parse(docstring)

        short_description = parsed_docstring.short_description or ""
        long_description = parsed_docstring.long_description or ""

        description = short_description + "\n" + long_description

        return_description = (
            parsed_docstring.returns.description if parsed_docstring.returns else ""
        )

        sig = inspect.signature(func)
        parameters = []
        for param in sig.parameters.values():

            param_name = param.name
            annotation = (
                param.annotation
                if param.annotation != inspect.Parameter.empty
                else None
            )

            default = (
                param.default if param.default != inspect.Parameter.empty else None
            )

            param_description = None
            for doc_param in parsed_docstring.params:
                if doc_param.arg_name == param_name:
                    param_description = doc_param.description
                    break

            if not param_description:
                raise ValueError(
                    f"Missing description for parameter '{param_name}' in function '{name}'"
                )

            if not annotation:
                raise ValueError(
                    f"Missing type for parameter '{param_name}' in function '{name}'"
                )

            parameters.append(
                ParameterInfo(
                    name=param_name,
                    annotation=annotation,
                    default=default,
                    description=param_description,
                )
            )

        return_type = (
            sig.return_annotation
            if sig.return_annotation != inspect.Signature.empty
            else None
        )

        return cls(
            name=name,
            description=description,
            parameters=parameters,
            return_type=return_type,
            return_description=return_description,
            func=func,
        )


FunctionRegistry = Dict[str, RegisteredFunction]
