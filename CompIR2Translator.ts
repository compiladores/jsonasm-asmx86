import { CompIR2, Expression, StatementIR2, Binops } from "./CompIR2.ts";
import { CompIR3, StatementIR3, Data } from "./CompIR3.ts";
import { Register } from "./CompIR4.ts";

const operators_const: [Register, Register] = ["rbx", "rax"]
const set_rax_0:CompIR3 = {movq: [{literal: 0}, "rax"]};


const binops_map:Record<Binops, Array<CompIR3>> = {
  "+": [{addq: operators_const}],
  "-": [{subq: operators_const}],
  "*": [{imulq: operators_const}],
  "/": [
    {cqto: ""},
    {idivq: "rbx"}
  ],

  "^": [
    {movq: [{literal: 1}, "rcx"]},
    {lbl: "0"},
    {cmpq: [{literal: 0}, "rbx"]},
    {je: "9f"},
    {imulq: ["rax", "rcx"]},
    {dec: "rbx"},
    {jmp: "0b"},

    {lbl: "9"},
    {movq: ["rcx", "rax"]}
  ],

  "%": [
    {cqto: ""},
    {idivq: "rbx"},
    {movq: ["rdx", "rax"]}
  ],
  "&": [{andq: operators_const}],
  "|": [{orq: operators_const}],
  ">>": [
    {movq: ["rbx", "rcx"]},
    {sarq: ["cl", "rax"]},
  ],
  "<<": [
    {movq: ["rbx", "rcx"]},
    {salq: ["cl", "rax"]},
  ],
  "<": [
    {cmpq: operators_const},
    set_rax_0,
    {setl: "al"},
  ],
  "<=": [
    {cmpq: operators_const},
    set_rax_0,
    {setle: "al"},
  ],
  ">": [
    {cmpq: operators_const},
    set_rax_0,
    {setg: "al"},
  ],
  ">=": [
    {cmpq: operators_const},
    set_rax_0,
    {setge: "al"},
  ],
  "==": [
    {cmpq: operators_const},
    set_rax_0,
    {sete: "al"},
  ],
  "~=": [
    {cmpq: operators_const},
    set_rax_0,
    {setne: "al"},
  ],

  "and": [
    {cmpq: [{literal: 0} , "rax"]}, // Compara primer elemento
    {je: "0f"},                     // Si falso, setea 0

    {cmpq: [{literal: 0} , "rbx"]}, //Compara segundo elemento
    {je: "0f"},                     // si falso, setea 0

    {movq: ["rbx", "rax"]}, // es verdadero, seteo como resultado el segundo valor.
    {jmp: "9f"},  

    {lbl: "0"},
    set_rax_0,

    {lbl: "9"}
  ],

  "or": [
    {cmpq: [{literal: 0} , "rax"]}, // Compara primer elemento
    {jne: "9f"},                    // si es verdadero, va al final, se devuelve rax

    {cmpq: [{literal: 0} , "rbx"]}, // compara segundo elemento
    {je: "0f"},                     // si es falso, setea rax 0.
    {movq: ["rbx", "rax"]},         // si es verdadero, se devuelve rbx
    {jmp: "9f"},                    // va al final

    {lbl: "0"},
    set_rax_0,

    {lbl: "9"}
  ]
}

const unops_map:Record<"-"|"!"|"~", Array<CompIR3>> = {
  "-": [{negq: "rax"}],
  "!": [
    {cmpq: [{literal: 0} , "rax"]},
    {movq: [{literal: 0}, "rax"]},
    {sete: "al"}
  ],
  "~": [{notq: "rax"}]
}

function translateOne(stmt: StatementIR2<Expression>): StatementIR3[] {
  stmt;
  if (typeof stmt != "object" || !("cmpq" in stmt || "set" in stmt || "call" in stmt || "return" in stmt))
    return [stmt];

  if ("cmpq" in stmt) {
    const ir3: StatementIR3[] = [];

    ir3.push(...translateExpr(stmt.cmpq[0]));
    ir3.push(...translateExpr(stmt.cmpq[1]));
    
    ir3.push({popq: "rbx"})
    ir3.push({popq: "rax"})


    ir3.push({cmpq: ["rax", "rbx"]});

    return ir3;
  }

  if ("set" in stmt) {
    const ir3: StatementIR3[] = [];

    ir3.push(...translateExpr(stmt.value));

    ir3.push({popq: stmt.set})

    return ir3;
  }

  if ("call" in stmt) {
    const instrucciones_arg: StatementIR3[] = [];

    const registers:Data[] = ["rdi", "rsi", "rdx", "rcx", "r8", "r9"];

    while (stmt.args.length > 0 && registers.length > 0) {
      const parameter = stmt.args.shift()
      const register = registers.shift();
      if (parameter == undefined || register == undefined) {
        throw new Error("PARAMETRO O REGISTRO ES UNDEFINED");       
      }

      const expression = translateExpr(parameter)
      instrucciones_arg.push(...expression);
      instrucciones_arg.push({popq: register})
    }

    for (const expressions of stmt.args.reverse()) {
      instrucciones_arg.push(...translateExpr(expressions));
    }

    return [
      "callBegin",
      ...instrucciones_arg,
      {callEnd: stmt.call}
    ];
  }

  if ("return" in stmt) {

    return [
      ...translateExpr(stmt.return),
      {popq: "rax"},
      "return"
    ]
  }

  throw Error("no se encontró el tipo de statment");
}

export function translate(code: CompIR2[]): CompIR3[] {
  return code.flatMap((command) => translateOne(command));
}

//va recursivcamente a izquierda, luego derecha
// caso base: pushea en stack el valor
// no caso base, popea en B, popea en A, realiza op B,A; luego pushea A
function translateExpr(expr: Expression): StatementIR3[] {
  if (typeof expr == "number" || "literal" in expr) {
    return [{pushq: expr}];
  }

  if ("call" in expr) {
    return [...translateOne(expr),
            {pushq: "rax"}];
  }

  if ("unop" in expr) {
    const inner_expr = translateExpr(expr.arg);


    const operation = unops_map[expr.unop];

    return [
      ...inner_expr,
      {popq: "rax"},
      ...operation,
      {pushq: "rax"}
    ];
  }

  if ("binop" in expr) {
    //TODO: IMPLEMENTAR TODOS LOS UNOPS. TAL VEZ CON UN DICCIONARIO?
    const left_expr = translateExpr(expr.argl);
    const right_expr = translateExpr(expr.argr);

    
    const operation = binops_map[expr.binop];
  

    return [
      ...left_expr,
      ...right_expr,
      {popq: "rbx"},
      {popq: "rax"},
      ...operation,
      {pushq: "rax"}
    ];
  }

  throw new Error("No se encontró el tipo de expresion");
}