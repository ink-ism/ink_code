import { monaco } from './monaco';

/**
 * 增强版 SQL 语法高亮（面向 MySQL/PostgreSQL 常见 DDL/DML）
 * 覆盖 Monaco 内置 SQL 分词器，细粒度 token 分类：
 * - DDL 关键字（CREATE/ALTER/DROP...）与 DML 关键字分色
 * - 约束/属性关键字（NOT NULL、DEFAULT、AUTO_INCREMENT、COMMENT、ENGINE...）
 * - 数据类型（BIGINT、VARCHAR、DATETIME...）青色
 * - 表名（CREATE TABLE / FROM / INTO / JOIN / UPDATE 后）与索引名（KEY/INDEX 后）
 * - 内置函数、常量（NULL/TRUE/InnoDB/utf8mb4）、变量、字符串、注释、数字
 * SQL 不区分大小写，通过 ignoreCase 统一处理。
 */
export function registerSqlLanguage(): void {
  // 按需导入下内置 sql 贡献不再加载，需显式注册语言 id
  monaco.languages.register({ id: 'sql' });
  monaco.languages.setMonarchTokensProvider('sql', {
    defaultToken: '',
    tokenPostfix: '.sql',
    ignoreCase: true,

    // DML / 逻辑 / 连接 关键字
    keywords: [
      'select', 'from', 'where', 'and', 'or', 'not', 'in', 'is', 'like',
      'between', 'exists', 'having', 'group', 'by', 'order', 'asc', 'desc', 'limit',
      'offset', 'distinct', 'as', 'on', 'join', 'inner', 'left', 'right', 'full',
      'outer', 'cross', 'natural', 'using', 'union', 'all', 'intersect', 'except',
      'insert', 'into', 'values', 'update', 'set', 'delete', 'if', 'else', 'then',
      'when', 'case', 'end', 'begin', 'commit', 'rollback', 'transaction', 'with',
      'recursive', 'to', 'over', 'window', 'rows', 'range', 'preceding', 'following',
      'unbounded', 'current', 'row', 'fetch', 'next', 'only', 'top', 'percent',
      'returning', 'conflict', 'do', 'nothing', 'lateral', 'rollup', 'cube',
      'grouping', 'sets', 'escape', 'nulls', 'first', 'last', 'any', 'some',
      'show', 'describe', 'use', 'explain', 'analyze'
    ],

    // DDL 关键字
    ddlKeywords: [
      'create', 'alter', 'drop', 'truncate', 'rename', 'add', 'column',
      'table', 'index', 'view', 'database', 'schema', 'procedure', 'trigger',
      'sequence', 'tablespace', 'grant', 'revoke', 'temporary', 'temp',
      'replace', 'optimize', 'partition'
    ],

    // 约束 / 表属性 关键字
    constraintKeywords: [
      'primary', 'key', 'foreign', 'references', 'constraint', 'unique', 'check',
      'default', 'auto_increment', 'comment', 'engine', 'charset', 'character',
      'collate', 'cascade', 'restrict', 'unsigned', 'signed', 'zerofill',
      'row_format', 'compression', 'storage', 'virtual', 'generated', 'always',
      'identity', 'increment', 'start', 'cache', 'nocache', 'cycle', 'noorder',
      'definer', 'sql', 'security', 'language', 'returns', 'return', 'declare',
      'after', 'before', 'each', 'for', 'instead', 'of'
    ],

    // 数据类型
    typeKeywords: [
      'int', 'integer', 'smallint', 'bigint', 'tinyint', 'mediumint', 'decimal',
      'numeric', 'float', 'real', 'double', 'precision', 'char', 'varchar',
      'nvarchar', 'nchar', 'text', 'tinytext', 'mediumtext', 'longtext', 'blob',
      'tinyblob', 'mediumblob', 'longblob', 'binary', 'varbinary', 'date', 'time',
      'datetime', 'timestamp', 'year', 'boolean', 'bool', 'bit', 'serial',
      'bigserial', 'smallserial', 'money', 'uuid', 'json', 'jsonb', 'xml', 'array',
      'enum', 'interval', 'bytea', 'inet', 'cidr', 'macaddr', 'point', 'geometry'
    ],

    // 内置函数
    builtinFunctions: [
      'count', 'sum', 'avg', 'min', 'max', 'abs', 'ceil', 'ceiling', 'floor',
      'round', 'mod', 'power', 'sqrt', 'exp', 'ln', 'log', 'sign', 'rand',
      'random', 'concat', 'concat_ws', 'length', 'char_length', 'lower', 'upper',
      'ucase', 'lcase', 'trim', 'ltrim', 'rtrim', 'substr', 'substring', 'left',
      'right', 'reverse', 'repeat', 'position', 'locate', 'instr', 'lpad', 'rpad',
      'split_part', 'coalesce', 'nullif', 'nvl', 'ifnull', 'isnull', 'greatest',
      'least', 'cast', 'convert', 'to_char', 'to_date', 'to_number', 'now',
      'current_date', 'current_time', 'current_timestamp', 'localtime', 'extract',
      'date_part', 'date_trunc', 'age', 'year', 'month', 'day', 'hour', 'minute',
      'second', 'row_number', 'rank', 'dense_rank', 'ntile', 'lag', 'lead',
      'first_value', 'last_value', 'nth_value', 'string_agg', 'group_concat',
      'array_agg', 'json_agg', 'percent_rank', 'cume_dist', 'ascii', 'chr',
      'format', 'regexp_replace', 'regexp_substr', 'regexp_matches', 'version',
      'database', 'schema', 'user', 'session_user', 'system_user', 'last_insert_id',
      'found_rows', 'row_count', 'sleep', 'uuid', 'md5', 'sha1', 'sha2', 'hex',
      'unhex', 'inet_aton', 'inet_ntoa', 'if', 'date_format', 'date_add',
      'date_sub', 'datediff', 'timestampdiff', 'str_to_date', 'unix_timestamp',
      'from_unixtime', 'curdate', 'curtime', 'sysdate', 'quarter', 'week',
      'dayofweek', 'dayofmonth', 'dayofyear', 'weekofyear', 'monthname', 'dayname'
    ],

    // 常量 / 引擎与字符集取值
    constants: [
      'true', 'false', 'null', 'unknown', 'innodb', 'myisam', 'memory', 'csv',
      'archive', 'blackhole', 'federated', 'performance_schema', 'utf8', 'utf8mb4',
      'utf8mb3', 'utf16', 'utf32', 'gbk', 'gb2312', 'big5', 'latin1', 'latin2',
      'ascii', 'unicode', 'general_ci', 'bin', 'utf8mb4_general_ci',
      'utf8mb4_unicode_ci', 'utf8mb4_0900_ai_ci'
    ],

    operators: [
      '=', '>', '<', '!', '~', '>=', '<=', '<>', '!=', '&&', '||', '+', '-', '*',
      '/', '%', '::', ':=', '->>', '->', '#>>', '#>'
    ],

    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    digits: /\d+(_+\d+)*/,
    hexdigits: /[0-9a-fA-F]+(_+[0-9a-fA-F]+)*/,

    tokenizer: {
      root: [
        { include: '@whitespace' },

        // DDL 语句 + 对象名：CREATE TABLE xxx / DROP INDEX IF EXISTS xxx
        // 注意：Monarch 分组 action 要求分组连续覆盖整个匹配，故空白并入第一组
        [/((?:create|alter|drop|truncate|rename)\s+(?:table|index|view|database|schema|procedure|trigger|sequence|tablespace)(?:\s+if\s+(?:not\s+)?exists)?\s+)([a-zA-Z_][\w$]*)/,
          ['keyword.ddl', 'type.table']],

        // 数据源 + 表名：FROM xxx / INTO xxx / JOIN xxx / REFERENCES xxx
        [/\b((?:from|into|join|references|table)\s+)([a-zA-Z_][\w$]*)/,
          ['keyword', 'type.table']],

        // UPDATE 表名（排除 ON UPDATE func( 形式）
        [/\b((?:update)\s+)([a-zA-Z_][\w$]*)\b(?!\s*\()/, ['keyword', 'type.table']],

        // 索引定义：KEY idx_xxx / INDEX idx_xxx
        [/\b((?:key|index)\s+)([a-zA-Z_][\w$]*)/, ['keyword.constraint', 'method']],

        // 双引号标识符 "colName" / 反引号标识符 `colName`
        [/"/, 'identifier.quote', '@quotedIdent'],
        [/`/, 'identifier.quote', '@backtickIdent'],

        // 字符串
        [/'/, 'string', '@string'],

        // 数字字面量
        [/0[xX]@hexdigits/, 'number.hex'],
        [/@digits\.@digits([eE][\-+]?@digits)?/, 'number.float'],
        [/\.@digits([eE][\-+]?@digits)?/, 'number.float'],
        [/@digits/, 'number'],

        // 变量 / 参数占位符：@name / @@name / :name / ? / $1
        // 注意：Monarch 中 @@ 转义为字面 @，故 @@@@? 编译后才是 @@?（@ 或 @@ 前缀）
        [/@@@@?[a-zA-Z_][\w$]*/, 'variable'],
        [/[:][$]?[a-zA-Z_][\w]*/, 'variable'],
        [/[?$]\d*/, 'variable'],

        // 括号与分隔符
        [/[{}()\[\]]/, '@brackets'],
        [/[;,.]/, 'delimiter'],
        [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],

        // 关键字 / 类型 / 函数 / 常量 / 普通标识符
        [/[a-zA-Z_][\w$]*/, {
          cases: {
            '@typeKeywords': 'type',
            '@ddlKeywords': 'keyword.ddl',
            '@constraintKeywords': 'keyword.constraint',
            '@builtinFunctions': 'method',
            '@constants': 'constant.language',
            '@keywords': 'keyword',
            '@default': 'identifier'
          }
        }]
      ],

      whitespace: [
        [/[ \t\r\n]+/, ''],
        [/\/\*/, 'comment', '@comment'],
        [/--.*$/, 'comment'],
        [/#.*$/, 'comment']
      ],

      comment: [
        [/[^\/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[\/*]/, 'comment']
      ],

      string: [
        [/[^']+/, 'string'],
        [/''/, 'string.escape'],
        [/'/, 'string', '@pop']
      ],

      quotedIdent: [
        [/[^"]+/, 'identifier.quote'],
        [/""/, 'identifier.quote'],
        [/"/, 'identifier.quote', '@pop']
      ],

      backtickIdent: [
        [/[^`]+/, 'identifier.quote'],
        [/`/, 'identifier.quote', '@pop']
      ]
    }
  });
}
